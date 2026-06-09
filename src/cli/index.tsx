import { Command } from "commander";

import { VELAIRE_NAME, VELAIRE_VERSION } from "@/index";

const program = new Command();

program
  .name(VELAIRE_NAME)
  .description("Velaire — a general-purpose agent runtime with a built-in coding preset")
  .version(VELAIRE_VERSION, "-v, --version")
  .action(() => {
    console.info("Velaire TUI is not implemented yet. Use --help to see available commands.");
  });

await program.parseAsync(process.argv);
