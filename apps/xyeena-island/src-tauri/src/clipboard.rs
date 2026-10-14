//! Real Windows clipboard reader supporting text, images (CF_DIB -> BMP data URL), and file lists (CF_HDROP).
//! Opt-in, in-memory, bounded, and private.

use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeClipboardItem {
    pub item_type: String, // "text" | "image" | "files"
    pub text: Option<String>,
    pub data_url: Option<String>,
    pub file_paths: Option<Vec<String>>,
    pub hash: String,
    pub size_bytes: usize,
}

fn calculate_hash(s: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

fn calculate_hash_bytes(b: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    b.hash(&mut hasher);
    hasher.finish()
}

fn simple_base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARSET[((triple >> 18) & 0x3F) as usize] as char);
        out.push(CHARSET[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn dib_to_bmp(dib: &[u8]) -> Option<Vec<u8>> {
    if dib.len() < 40 {
        return None;
    }
    let bi_size = u32::from_le_bytes(dib[0..4].try_into().ok()?);
    let bi_bit_count = u16::from_le_bytes(dib[14..16].try_into().ok()?);
    let bi_compression = u32::from_le_bytes(dib[16..20].try_into().ok()?);
    let bi_clr_used = u32::from_le_bytes(dib[32..36].try_into().ok()?);

    let color_table_size = if bi_bit_count <= 8 {
        let num_colors = if bi_clr_used > 0 {
            bi_clr_used
        } else {
            1u32 << bi_bit_count
        };
        num_colors * 4
    } else if bi_compression == 3 {
        // BI_BITFIELDS: 3 DWORD masks
        12
    } else {
        bi_clr_used * 4
    };

    let offset = 14 + bi_size + color_table_size;
    let file_size = 14 + dib.len() as u32;

    let mut bmp = Vec::with_capacity(file_size as usize);
    // BITMAPFILEHEADER
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&file_size.to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes()); // reserved 1
    bmp.extend_from_slice(&0u16.to_le_bytes()); // reserved 2
    bmp.extend_from_slice(&offset.to_le_bytes());
    // DIB data (BITMAPINFOHEADER + optional colors + pixels)
    bmp.extend_from_slice(dib);
    Some(bmp)
}

#[cfg(target_os = "windows")]
pub fn read_native_clipboard_item() -> Result<Option<NativeClipboardItem>, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    const CF_DIB: u32 = 8;
    const CF_UNICODETEXT: u32 = 13;
    const CF_HDROP: u32 = 15;

    unsafe {
        if OpenClipboard(Some(HWND(std::ptr::null_mut()))).is_err() {
            return Ok(None);
        }
        struct ClipGuard;
        impl Drop for ClipGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = CloseClipboard();
                }
            }
        }
        let _guard = ClipGuard;

        // 1. Files copied from Explorer (CF_HDROP)
        if IsClipboardFormatAvailable(CF_HDROP).is_ok() {
            if let Ok(handle) = GetClipboardData(CF_HDROP) {
                let hdrop = HDROP(handle.0);
                let count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
                if count > 0 {
                    let mut files = Vec::new();
                    for i in 0..count {
                        let len = DragQueryFileW(hdrop, i, None) as usize;
                        let mut buf = vec![0u16; len + 1];
                        DragQueryFileW(hdrop, i, Some(&mut buf));
                        buf.pop();
                        if let Ok(path) = String::from_utf16(&buf) {
                            files.push(path);
                        }
                    }
                    if !files.is_empty() {
                        let text_repr = files.join("\n");
                        let hash = format!("files:{:x}", calculate_hash(&text_repr));
                        return Ok(Some(NativeClipboardItem {
                            item_type: "files".into(),
                            text: Some(text_repr),
                            data_url: None,
                            file_paths: Some(files),
                            hash,
                            size_bytes: count as usize,
                        }));
                    }
                }
            }
        }

        // 2. Images from browsers, Paint, Snipping Tool (CF_DIB)
        if IsClipboardFormatAvailable(CF_DIB).is_ok() {
            if let Ok(handle) = GetClipboardData(CF_DIB) {
                let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0);
                let ptr = GlobalLock(hglobal);
                if !ptr.is_null() {
                    let size = GlobalSize(hglobal);
                    // Bound max image size to 20MB to prevent memory explosion
                    if size > 0 && size <= 20 * 1024 * 1024 {
                        let dib_slice = std::slice::from_raw_parts(ptr as *const u8, size);
                        let bmp_bytes = dib_to_bmp(dib_slice);
                        let _ = GlobalUnlock(hglobal);
                        if let Some(bmp) = bmp_bytes {
                            let sample_len = std::cmp::min(bmp.len(), 512);
                            let hash = format!("img:{:x}", calculate_hash_bytes(&bmp[..sample_len]));
                            let base64 = simple_base64_encode(&bmp);
                            let data_url = format!("data:image/bmp;base64,{base64}");
                            let size_mb = (bmp.len() as f64) / (1024.0 * 1024.0);
                            let text = format!("Image ({:.2} MB)", size_mb);
                            return Ok(Some(NativeClipboardItem {
                                item_type: "image".into(),
                                text: Some(text),
                                data_url: Some(data_url),
                                file_paths: None,
                                hash,
                                size_bytes: bmp.len(),
                            }));
                        }
                    } else {
                        let _ = GlobalUnlock(hglobal);
                    }
                }
            }
        }

        // 3. Text (CF_UNICODETEXT)
        if IsClipboardFormatAvailable(CF_UNICODETEXT).is_ok() {
            if let Ok(handle) = GetClipboardData(CF_UNICODETEXT) {
                let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0);
                let ptr = GlobalLock(hglobal);
                if !ptr.is_null() {
                    let mut len = 0;
                    let u16_ptr = ptr as *const u16;
                    while *u16_ptr.add(len) != 0 {
                        len += 1;
                        if len > 100_000 {
                            break;
                        }
                    }
                    let slice = std::slice::from_raw_parts(u16_ptr, len);
                    let text = String::from_utf16_lossy(slice);
                    let _ = GlobalUnlock(hglobal);
                    let hash = format!("text:{:x}", calculate_hash(&text));
                    return Ok(Some(NativeClipboardItem {
                        item_type: "text".into(),
                        text: Some(text),
                        data_url: None,
                        file_paths: None,
                        hash,
                        size_bytes: len * 2,
                    }));
                }
            }
        }

        Ok(None)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn read_native_clipboard_item() -> Result<Option<NativeClipboardItem>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
pub fn write_native_image_to_clipboard(data_url: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };

    const CF_DIB: u32 = 8;

    let base64_str = if let Some(idx) = data_url.find(',') {
        &data_url[idx + 1..]
    } else {
        data_url
    };

    // Decode base64
    let bytes = base64_decode(base64_str).ok_or("Invalid base64 image data")?;
    // A BMP file starts with 14 bytes BITMAPFILEHEADER.
    // CF_DIB expects BITMAPINFO (starting at byte 14).
    if bytes.len() <= 14 || &bytes[0..2] != b"BM" {
        return Err("Not a valid BMP image".into());
    }
    let dib_bytes = &bytes[14..];

    unsafe {
        OpenClipboard(Some(HWND(std::ptr::null_mut())))
            .map_err(|e| format!("Cannot open clipboard: {e}"))?;
        struct ClipGuard;
        impl Drop for ClipGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = CloseClipboard();
                }
            }
        }
        let _guard = ClipGuard;

        EmptyClipboard().map_err(|e| format!("Cannot empty clipboard: {e}"))?;
        let hglobal = GlobalAlloc(GMEM_MOVEABLE, dib_bytes.len())
            .map_err(|e| format!("GlobalAlloc failed: {e}"))?;
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return Err("GlobalLock failed".into());
        }
        std::ptr::copy_nonoverlapping(dib_bytes.as_ptr(), ptr as *mut u8, dib_bytes.len());
        let _ = GlobalUnlock(hglobal);

        SetClipboardData(CF_DIB, Some(windows::Win32::Foundation::HANDLE(hglobal.0)))
            .map_err(|e| format!("SetClipboardData failed: {e}"))?;
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn write_native_image_to_clipboard(_data_url: &str) -> Result<(), String> {
    Err("Only supported on Windows".into())
}

pub fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let clean: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if clean.len() % 4 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(clean.len() / 4 * 3);
    let decode_val = |b: u8| -> Option<u32> {
        match b {
            b'A'..=b'Z' => Some((b - b'A') as u32),
            b'a'..=b'z' => Some((b - b'a' + 26) as u32),
            b'0'..=b'9' => Some((b - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            b'=' => Some(0),
            _ => None,
        }
    };

    for chunk in clean.chunks(4) {
        let v0 = decode_val(chunk[0])?;
        let v1 = decode_val(chunk[1])?;
        let v2 = decode_val(chunk[2])?;
        let v3 = decode_val(chunk[3])?;
        let triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
        out.push(((triple >> 16) & 0xFF) as u8);
        if chunk[2] != b'=' {
            out.push(((triple >> 8) & 0xFF) as u8);
        }
        if chunk[3] != b'=' {
            out.push((triple & 0xFF) as u8);
        }
    }
    Some(out)
}
