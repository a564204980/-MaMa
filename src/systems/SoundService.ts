import { Point, distance } from '../gameplay/House';
type Cue = 'step' | 'door' | 'found' | 'warning' | 'cry' | 'heartbeat';
// Small, pre-rendered original cues; bounded handles and no catch-up playback after resume.
export class SoundService {
  private handles = new Map<Cue, any>();
  volume = .55;
  play(cue: Cue, source?: Point, listener?: Point) {
    if (!this.volume) return;
    try {
      let handle = this.handles.get(cue);
      if (!handle) {
        handle = typeof wx !== 'undefined' ? wx.createInnerAudioContext() : typeof Audio !== 'undefined' ? new Audio() : null;
        if (!handle) return;
        handle.src = `assets/audio/${cue}.wav`; this.handles.set(cue, handle);
      }
      handle.volume = Math.min(1, this.volume * (source && listener ? 180 / (180 + distance(source, listener)) : 1));
      if (handle.stop) handle.stop(); else { handle.pause(); handle.currentTime = 0; }
      const promise = handle.play(); if (promise?.catch) promise.catch(() => {});
    } catch { /* Missing/disabled audio must never interrupt gameplay. */ }
  }
  stop() { for (const h of this.handles.values()) { if (h.stop) h.stop(); else h.pause(); } }
  dispose() { this.stop(); for (const h of this.handles.values()) h.destroy?.(); this.handles.clear(); }
}
