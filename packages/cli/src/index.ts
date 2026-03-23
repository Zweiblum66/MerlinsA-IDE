#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { sprintCommand } from "./commands/sprint.js";
import { agentCommand } from "./commands/agent.js";
import { apiCommand } from "./commands/api.js";
import { reportCommand } from "./commands/report.js";

const program = new Command();

program
  .name("the-ide")
  .description("AI Vibe Coding & Agent-Based IDE — Scrum-powered development with AI agents")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(sprintCommand);
program.addCommand(agentCommand);
program.addCommand(apiCommand);
program.addCommand(reportCommand);

program.parse();
