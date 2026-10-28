#!/usr/bin/env node
// Offline label and fit for bundle-rug-mcap-v1. Read-only on the database you pass.
// Pre-registration: docs/bundle-rug-zone-v1.md
//
// Usage:
//   node scripts/bundle-rug-backtest.js --db <copy.db> [--model-out <file>] [--model <frozen.json>]
//
// --db is a copy. The script refuses /opt/curvewatch/data/curvewatch.db and anything under ./data.
// It does not write the source database. --model-out writes coefficients for a human to review.
// --model scores an already frozen file against bundle_risk_log in the copy.
// The time-ordered fit is descriptive. validated stays false until the prospective check passes.

import fs from 'node:fs';
import { assertWritableOutput, collectReport, openReadonly } from '../src/bundle/risk.js';

function usage() {
  console.log(`Usage: node scripts/bundle-rug-backtest.js --db <copy.db> [--model-out <file>] [--model <frozen.json>]

Reads a copy of a Curvewatch database in readonly mode. Labels the market cap at which
launch-window bundle wallets have sold at least half of the tokens they bought in that
window, then fits bundle-rug-mcap-v1 on a time-ordered split.

Does not write the source database, ./data, or /opt/curvewatch.
--model-out writes frozen coefficients for review. Loading them is a separate step.
--model scores an already frozen file against bundle_risk_log rows in the copy.
The fit itself is descriptive. It is not a prospective pass.`);
}

function opt(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    const err = new Error(`${name} needs a value`);
    err.code = 'USAGE';
    throw err;
  }
  return value;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

try {
  const dbPath = opt(args, '--db');
  const modelOut = opt(args, '--model-out');
  const modelFile = opt(args, '--model');
  if (!dbPath) {
    usage();
    const err = new Error('pass --db with a copy of the database');
    err.code = 'USAGE';
    throw err;
  }
  if (modelOut) assertWritableOutput(modelOut, dbPath);
  const database = openReadonly(dbPath);
  try {
    const report = collectReport(database, { modelFile });
    if (modelOut) {
      if (!report.fit.ok) console.error(`not writing a model file: ${report.fit.reason}`);
      else {
        const body = {
          ...report.fit.model,
          equation: report.fit.equation,
          preRegistration: report.preRegistration,
          validated: false,
          note: 'Frozen coefficients from a descriptive time-ordered fit. Not a prospective pass.',
        };
        fs.writeFileSync(modelOut, `${JSON.stringify(body, null, 2)}\n`);
      }
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    database.close();
  }
} catch (e) {
  console.error(e.message);
  process.exit(e.code === 'REFUSED' || e.code === 'USAGE' ? 2 : 1);
}
