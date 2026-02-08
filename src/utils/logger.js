const chalk = require('chalk');

const logger = {
  info: (message) => {
    console.log(message);
  },

  step: (message) => {
    console.log(chalk.cyan(`\n>> ${message}`));
  },

  success: (message) => {
    console.log(chalk.green(`[OK] ${message}`));
  },

  warn: (message) => {
    console.log(chalk.yellow(`[WARN] ${message}`));
  },

  error: (message) => {
    console.log(chalk.red(`[ERROR] ${message}`));
  },

  debug: (message) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }
};

module.exports = logger;
