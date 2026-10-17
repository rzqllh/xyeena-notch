//! Connected external service integrations module: Vercel, Notion, n8n, Resend, Cal.com, Stripe.
//! Provides read-only status checks, environment token detection, and honest unconfigured state reporting.

use serde::{Deserialize, Serialize};

/// Supported external service descriptor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrationDescriptor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub auth_type: String,
    pub env_var: String,
    pub docs_url: String,
}

/// Integration connectivity status result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrationStatusResult {
    pub provider: String,
    pub configured: bool,
    pub status: String, // "connected" | "unconfigured" | "auth_error" | "rate_limited" | "error"
    pub summary: Option<String>,
    pub account_id: Option<String>,
    pub error: Option<String>,
}

/// Return the catalog of supported external integrations.
#[tauri::command]
pub fn list_supported_integrations() -> Vec<IntegrationDescriptor> {
    vec![
        IntegrationDescriptor {
            id: "vercel".into(),
            name: "Vercel".into(),
            description: "Deployments and build notifications".into(),
            auth_type: "bearer_token".into(),
            env_var: "VERCEL_TOKEN".into(),
            docs_url: "https://vercel.com/docs/rest-api".into(),
        },
        IntegrationDescriptor {
            id: "notion".into(),
            name: "Notion".into(),
            description: "Workspace documentation and task databases".into(),
            auth_type: "bearer_token".into(),
            env_var: "NOTION_API_KEY".into(),
            docs_url: "https://developers.notion.com".into(),
        },
        IntegrationDescriptor {
            id: "n8n".into(),
            name: "n8n".into(),
            description: "Workflow automation and webhook triggers".into(),
            auth_type: "api_key".into(),
            env_var: "N8N_API_KEY".into(),
            docs_url: "https://docs.n8n.io/api".into(),
        },
        IntegrationDescriptor {
            id: "resend".into(),
            name: "Resend".into(),
            description: "Transactional email delivery and domains".into(),
            auth_type: "api_key".into(),
            env_var: "RESEND_API_KEY".into(),
            docs_url: "https://resend.com/docs/api-reference".into(),
        },
        IntegrationDescriptor {
            id: "calcom".into(),
            name: "Cal.com".into(),
            description: "Meeting schedules and availability slots".into(),
            auth_type: "api_key".into(),
            env_var: "CALCOM_API_KEY".into(),
            docs_url: "https://cal.com/docs/api-reference".into(),
        },
        IntegrationDescriptor {
            id: "stripe".into(),
            name: "Stripe".into(),
            description: "Restricted read-only account and balance checks".into(),
            auth_type: "api_key".into(),
            env_var: "STRIPE_API_KEY".into(),
            docs_url: "https://stripe.com/docs/api".into(),
        },
    ]
}

/// Resolve the API key or token for a given provider, checking arguments first, then environment.
pub fn resolve_provider_token(provider: &str, direct_key: Option<String>) -> Option<String> {
    if let Some(key) = direct_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    match provider {
        "vercel" => std::env::var("VERCEL_TOKEN").ok(),
        "notion" => std::env::var("NOTION_API_KEY")
            .or_else(|_| std::env::var("NOTION_TOKEN"))
            .ok(),
        "n8n" => std::env::var("N8N_API_KEY").ok(),
        "resend" => std::env::var("RESEND_API_KEY").ok(),
        "calcom" => std::env::var("CALCOM_API_KEY").ok(),
        "stripe" => std::env::var("STRIPE_API_KEY")
            .or_else(|_| std::env::var("STRIPE_SECRET_KEY"))
            .ok(),
        _ => None,
    }
    .filter(|s| !s.trim().is_empty())
}

/// Build endpoint URL and headers for a provider health/identity check.
pub fn build_provider_check_request(
    provider: &str,
    token: &str,
    base_url: Option<&str>,
) -> Result<(String, Vec<(String, String)>), String> {
    match provider {
        "vercel" => Ok((
            "https://api.vercel.com/v2/user".into(),
            vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
            ],
        )),
        "notion" => Ok((
            "https://api.notion.com/v1/users/me".into(),
            vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("Notion-Version".into(), "2022-06-28".into()),
                ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
            ],
        )),
        "n8n" => {
            let host = base_url.unwrap_or("http://localhost:5678").trim_end_matches('/');
            if !host.starts_with("http://") && !host.starts_with("https://") {
                return Err("n8n host must start with http:// or https://".into());
            }
            Ok((
                format!("{host}/api/v1/workflows?limit=1"),
                vec![
                    ("X-N8N-API-KEY".into(), token.to_string()),
                    ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
                ],
            ))
        }
        "resend" => Ok((
            "https://api.resend.com/api-keys".into(),
            vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
            ],
        )),
        "calcom" => Ok((
            "https://api.cal.com/v1/users/me".into(),
            vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
            ],
        )),
        "stripe" => Ok((
            "https://api.stripe.com/v1/account".into(),
            vec![
                ("Authorization".into(), format!("Bearer {token}")),
                ("User-Agent".into(), "Xyeena-Notch/1.0".into()),
            ],
        )),
        other => Err(format!("Unsupported integration provider: {other}")),
    }
}

/// Execute a read-only integration status check via curl stdin piping.
#[tauri::command]
pub fn check_integration_status(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<IntegrationStatusResult, String> {
    let supported = list_supported_integrations();
    let desc = match supported.iter().find(|d| d.id == provider) {
        Some(d) => d,
        None => {
            return Err(format!("Unknown provider: {provider}"));
        }
    };

    let token = match resolve_provider_token(&provider, api_key) {
        Some(t) => t,
        None => {
            return Ok(IntegrationStatusResult {
                provider: provider.clone(),
                configured: false,
                status: "unconfigured".into(),
                summary: None,
                account_id: None,
                error: Some(format!(
                    "Unconfigured: set {} environment variable or provide token",
                    desc.env_var
                )),
            });
        }
    };

    let (url, headers) = build_provider_check_request(&provider, &token, base_url.as_deref())?;

    // Build curl config on stdin
    let mut config = String::new();
    config.push_str(&format!(
        "url = \"{}\"\n",
        crate::escape_curl_config_str(&url)
    ));
    config.push_str("request = \"GET\"\n");
    config.push_str("max-time = 10\n");
    config.push_str("max-filesize = 65536\n");
    config.push_str("header = \"Expect:\"\n");
    for (k, v) in headers {
        config.push_str(&format!(
            "header = \"{}: {}\"\n",
            crate::escape_curl_config_str(&k),
            crate::escape_curl_config_str(&v)
        ));
    }

    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args(["-s", "-i", "--config", "-"]);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn transport: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(config.as_bytes());
        let _ = stdin.flush();
        drop(stdin);
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Transport execution failed: {e}"))?;

    let raw = String::from_utf8_lossy(&output.stdout);
    let parsed = crate::parse_curl_http_response(&raw, output.status.success(), "")?;

    if parsed.status >= 200 && parsed.status < 300 {
        Ok(IntegrationStatusResult {
            provider,
            configured: true,
            status: "connected".into(),
            summary: Some(format!("HTTP {} OK · Verified", parsed.status)),
            account_id: None,
            error: None,
        })
    } else if parsed.status == 401 || parsed.status == 403 {
        Ok(IntegrationStatusResult {
            provider,
            configured: true,
            status: "auth_error".into(),
            summary: None,
            account_id: None,
            error: Some(format!("HTTP {} · Authentication rejected", parsed.status)),
        })
    } else if parsed.status == 429 {
        Ok(IntegrationStatusResult {
            provider,
            configured: true,
            status: "rate_limited".into(),
            summary: None,
            account_id: None,
            error: Some("HTTP 429 · Rate limit exceeded".into()),
        })
    } else {
        Ok(IntegrationStatusResult {
            provider,
            configured: true,
            status: "error".into(),
            summary: None,
            account_id: None,
            error: Some(format!("HTTP {} error", parsed.status)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supported_integrations_catalog() {
        let catalog = list_supported_integrations();
        assert_eq!(catalog.len(), 6);
        let ids: Vec<&str> = catalog.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"vercel"));
        assert!(ids.contains(&"notion"));
        assert!(ids.contains(&"n8n"));
        assert!(ids.contains(&"resend"));
        assert!(ids.contains(&"calcom"));
        assert!(ids.contains(&"stripe"));
    }

    #[test]
    fn test_unconfigured_service_returns_unconfigured() {
        let res = check_integration_status("vercel".into(), None, None)
            .expect("Unconfigured service must return Ok result");
        assert_eq!(res.provider, "vercel");
        assert!(!res.configured);
        assert_eq!(res.status, "unconfigured");
        assert!(res.error.unwrap().contains("VERCEL_TOKEN"));
    }

    #[test]
    fn test_header_and_url_validation() {
        let (url, headers) = build_provider_check_request("notion", "secret_123", None).unwrap();
        assert_eq!(url, "https://api.notion.com/v1/users/me");
        assert!(headers.iter().any(|(k, v)| k == "Notion-Version" && v == "2022-06-28"));

        let (stripe_url, stripe_headers) =
            build_provider_check_request("stripe", "rk_test_123", None).unwrap();
        assert_eq!(stripe_url, "https://api.stripe.com/v1/account");
        assert!(stripe_headers.iter().any(|(k, v)| k == "Authorization" && v == "Bearer rk_test_123"));

        let n8n_res = build_provider_check_request("n8n", "key", Some("invalid-host"));
        assert!(n8n_res.is_err(), "Invalid host without http/https should be rejected");
    }

    #[test]
    fn test_unknown_provider_rejected() {
        assert!(check_integration_status("unknown_service_xyz".into(), None, None).is_err());
    }
}
