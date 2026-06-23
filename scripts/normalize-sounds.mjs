#!/usr/bin/env node
/**
 * Normalise le volume des sons vers ~-16 LUFS (ffmpeg loudnorm two-pass).
 *
 * Usage:
 *   node scripts/normalize-sounds.mjs
 *   node scripts/normalize-sounds.mjs --source shared/client/sounds/_source
 *
 * Prérequis : ffmpeg dans le PATH.
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
const SOURCE_DIR = sourceIdx >= 0
  ? path.resolve(ROOT, args[sourceIdx + 1])
  : path.join(ROOT, 'shared', 'client', 'sounds', '_source');
const OUT_DIR = path.join(ROOT, 'shared', 'client', 'sounds');

const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function loudnormTwoPass(inputPath, outputPath) {
  const pass1 = spawnSync(
    'ffmpeg',
    [
      '-hide_banner', '-i', inputPath,
      '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
      '-f', 'null', '-',
    ],
    { encoding: 'utf8' }
  );
  const stderr = `${pass1.stderr || ''}${pass1.stdout || ''}`;
  const jsonMatch = stderr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`loudnorm pass1: pas de JSON pour ${inputPath}`);
  }
  const stats = JSON.parse(jsonMatch[0]);

  if (!Number.isFinite(Number(stats.input_i))) {
    const single = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-y', '-i', inputPath, '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}`, outputPath],
      { encoding: 'utf8' }
    );
    if (single.status !== 0) throw new Error(single.stderr || 'loudnorm single-pass failed');
    return;
  }
  const filter = [
    `loudnorm=I=${TARGET_I}`,
    `TP=${TARGET_TP}`,
    `LRA=${TARGET_LRA}`,
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    'linear=true',
  ].join(':');

  const pass2 = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-y', '-i', inputPath, '-af', filter, outputPath],
    { encoding: 'utf8' }
  );
  if (pass2.status !== 0) {
    throw new Error(pass2.stderr || 'ffmpeg pass2 failed');
  }
}

function main() {
  if (!hasFfmpeg()) {
    console.error('ffmpeg introuvable. Installez ffmpeg puis relancez.');
    process.exit(1);
  }

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Dossier source introuvable : ${SOURCE_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  const files = fs.readdirSync(SOURCE_DIR).filter((f) => /\.(mp3|wav|ogg)$/i.test(f));
  if (!files.length) {
    console.log('Aucun fichier audio dans', SOURCE_DIR);
    return;
  }

  console.log(`Normalisation de ${files.length} fichier(s) → ${OUT_DIR}`);
  for (const file of files) {
    const input = path.join(SOURCE_DIR, file);
    const output = path.join(OUT_DIR, file);
    console.log(`\n▶ ${file}`);
    try {
      loudnormTwoPass(input, output);
    } catch (err) {
      console.error(`  Échec ${file}:`, err.message);
      fs.copyFileSync(input, output);
      console.log('  → copie brute conservée');
    }
  }
  console.log('\nTerminé. Ajustez les gains fins dans sounds-manifest.json si besoin.');
}

main();
