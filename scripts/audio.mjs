import fs from 'node:fs';
fs.mkdirSync('assets/audio', { recursive: true });
const sampleRate = 16000;
const specs = { step: [.12, 85], door: [.3, 105], found: [.5, 660], warning: [.9, 190], cry: [1.1, 440], heartbeat: [.5, 55] };
for (const [name, [duration, frequency]] of Object.entries(specs)) {
  const count = Math.floor(duration * sampleRate), b = Buffer.alloc(44 + count * 2);
  b.write('RIFF'); b.writeUInt32LE(36 + count * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate, env = Math.sin(Math.PI * t / duration) ** 2 * Math.exp(-t * (name === 'step' ? 22 : 2));
    const modulation = name === 'cry' ? 45 * Math.sin(t * 8) : 0;
    const value = (Math.sin(2 * Math.PI * frequency * t + modulation) + .2 * Math.sin(2 * Math.PI * frequency * 2.01 * t)) * env * .32;
    b.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  fs.writeFileSync(`assets/audio/${name}.wav`, b);
}
console.log('Six original synthesized prototype cues generated.');
