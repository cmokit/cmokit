#!/usr/bin/env node
// The `cmokit` command's entry point.

import { run } from './command.ts';

process.exitCode = await run(process.argv.slice(2), { env: process.env, out: (line) => console.log(line) });
