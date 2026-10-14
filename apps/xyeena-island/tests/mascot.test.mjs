import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseFoldState,foldStatus,isFoldState,FOLD_ART} from '../src/core/mascot.mjs';

test('original Fold defaults to idle without invented agent activity',()=>{
 assert.equal(chooseFoldState(), 'idle');
 assert.equal(chooseFoldState({runs:[{state:'CLOSE'}]}),'idle');
 assert.equal(chooseFoldState({runs:[{state:'UNKNOWN'}]}),'idle');
});
test('media playback maps to playing only when the media source reports it',()=>{
 assert.equal(chooseFoldState({mediaPlaying:true}),'playing');
 assert.equal(chooseFoldState({mediaPlaying:false}),'idle');
});
test('explicit meeting timer takes precedence over media playback',()=>{
 assert.equal(chooseFoldState({mediaPlaying:true,meetingActive:true}),'listening');
});
test('Xyeena workflow activity and DEBUG take precedence in defined order',()=>{
 assert.equal(chooseFoldState({runs:[{state:'EXECUTE'}]}),'working');
 assert.equal(chooseFoldState({runs:[{state:'DEBUG'}],meetingActive:true}),'attention');
 assert.equal(chooseFoldState({runs:[{state:'VERIFY'}],mediaPlaying:true}),'working');
});
test('Fold supports bounded states and labels without false claims',()=>{
 assert.ok(['idle','playing','listening','working','attention'].every(isFoldState));
 assert.equal(isFoldState('watching-microphone'),false);
 assert.match(foldStatus('listening'),/timer/i);
 assert.match(foldStatus('attention'),/review/i);
});
test('original vector contains no remote assets, scripts, or embedded images',()=>{
 assert.match(FOLD_ART,/<svg/);
 assert.doesNotMatch(FOLD_ART,/(<script|<image|<foreignObject|<use|<animate|Mochi|Coucou)/i);
});
