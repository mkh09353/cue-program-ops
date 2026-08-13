#!/usr/bin/env node
/**
 * Ruckus command line interface.
 *
 * Designed for AI agents as first-class users: every command supports --json,
 * failures exit non-zero with the server's own message, and `cue help` plus
 * `cue <command> --help` document the whole surface without reading the source.
 *
 *   npx tsx cli/cue.ts overview
 *   npx tsx cli/cue.ts schedule place ses-x --day 2026-10-12 --time 09:00 --room 'Main Hall'
 */
import { COMMANDS, type Command } from "./commands.js";
import { ApiError, DEFAULT_EVENT, DEFAULT_URL, flagBool, out, parseArgs, resolveConfig } from "./lib.js";

const GLOBAL_HELP = `Ruckus - conference program operations from the command line.

USAGE
  cue <command> [action] [args] [--flags]

GLOBAL FLAGS
  --url <url>        API base URL (env RUCKUS_URL, default ${DEFAULT_URL})
  --event <id>       event id to operate on (env RUCKUS_EVENT, default ${DEFAULT_EVENT})
  --role <role>      demo identity role: organizer | reviewer | speaker (env RUCKUS_ROLE, default organizer)
  --persona <id>     demo persona id (env RUCKUS_PERSONA, default org-swyx)
  --json             machine-readable JSON instead of tables. Available on EVERY command.
  --help             show help for a command

IDENTITY
  Ruckus uses demo persona simulation, not authentication: --role and --persona set the
  x-demo-role and x-demo-persona headers. Public commands (cfp) need no identity.

EXIT CODES
  0 success · 1 request or usage error (message printed to stderr)

COMMANDS
${COMMANDS.map((c) => `  ${c.name.padEnd(12)} ${c.summary}`).join("\n")}

START HERE
  cue overview                 pull the entire program state in one call
  cue <command> --help         full usage for any command
`;

function commandHelp(command: Command): string {
  const lines = [`${command.name} - ${command.summary}`, "", "USAGE"];
  for (const usage of command.usage) lines.push(`  ${usage}`);
  if (command.options?.length) {
    lines.push("", "OPTIONS");
    for (const option of command.options) lines.push(`  ${option}`);
  }
  lines.push("", "Every command also accepts --json, --url, --event, --role, --persona.");
  return lines.join("\n");
}

export async function main(argv: string[]): Promise<number> {
  const { words, flags } = parseArgs(argv);
  const name = words[0];

  if (!name || name === "help" || flagBool(flags, "help")) {
    const target = name === "help" ? words[1] : name;
    const command = COMMANDS.find((c) => c.name === target);
    if (command) {
      out(commandHelp(command));
      return 0;
    }
    out(GLOBAL_HELP);
    return name && !command && name !== "help" ? 1 : 0;
  }

  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    process.stderr.write(`unknown command "${name}". Run: cue help\n`);
    return 1;
  }

  const config = resolveConfig(flags);
  try {
    await command.run({ config, words: words.slice(1), flags });
    return 0;
  } catch (error) {
    const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
    if (config.json) out(JSON.stringify({ ok: false, error: message, status: error instanceof ApiError ? error.status : undefined }, null, 2));
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

// Only run when invoked directly, so tests can import main().
const invoked = process.argv[1] || "";
if (/cue\.(ts|js|mjs)$/.test(invoked)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
