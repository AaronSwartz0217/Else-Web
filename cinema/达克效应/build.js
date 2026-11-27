const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const FRAME_DIR = path.join(__dirname, 'frames');
const AUDIO_FILE = path.join(__dirname, 'audio.wav');
const OUTPUT_FILE = path.join(__dirname, 'dunning_kruger.mp4');

const candidates = [
    path.join(__dirname, '..', 'ffmpeg-bin', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, 'ffmpeg-bin', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
];
const found = candidates.find(p => fs.existsSync(p));
const ffmpeg = found || 'ffmpeg';

console.log('Using ffmpeg:', ffmpeg);

const frames = fs.readdirSync(FRAME_DIR).filter(f => f.match(/frame_\d+\.png$/)).sort();
console.log(`Found ${frames.length} frames`);
if (frames.length === 0) {
    console.error('No frames found! Run render.js first.');
    process.exit(1);
}

const inputPattern = path.join(FRAME_DIR, 'frame_%04d.png');
const hasAudio = fs.existsSync(AUDIO_FILE);
if (!hasAudio) console.warn('!! audio.wav 不存在，将出无声片');

const args = ['-y', '-framerate', String(FPS), '-i', inputPattern];
if (hasAudio) args.push('-i', AUDIO_FILE);
args.push(
    '-c:v', 'libx264',
    '-preset', 'slow',
    // 全片叠加 WebGL 逐像素颗粒，高码率收益很低，CRF 21 在肉眼无差的前提下收敛体积
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
);
if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(OUTPUT_FILE);

console.log('Running: ffmpeg', args.join(' '));
const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });
if (result.status !== 0) {
    console.error('FFmpeg failed with exit code', result.status);
    process.exit(1);
}

console.log('\n========================================');
console.log('Video created successfully!');
console.log('Output:', OUTPUT_FILE);
console.log('Size:', (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2), 'MB');
console.log('========================================');
