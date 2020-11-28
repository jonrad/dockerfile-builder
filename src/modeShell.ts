import fs = require('fs');
import resources from './resources';
import {DockerfileWriter} from './dockerfileWriter';
import {CommandFilter} from './filter';
import {LineProcessor, DockerwriteCommandProcessor} from './lineProcessor';
import pty = require('node-pty');
import {exit} from 'process';

export class ModeShell {
  private readonly lineProcessor: LineProcessor;

  constructor(
    private dockerfileWriter: DockerfileWriter,
    private filter: CommandFilter
  ) {
    this.lineProcessor = new LineProcessor(
      new DockerwriteCommandProcessor(dockerfileWriter, filter)
    );
  }

  run(image: string) {
    const size = (process.stdout.getWindowSize && process.stdout.getWindowSize()) || [undefined, undefined];

    const child = pty.spawn(
      'docker',
      [
        'run',
        '-it',
        '--rm',
        '--entrypoint',
        'bash',
        image,
        '-c',
        fs.readFileSync(resources.promptCommand).toString() +
          '\n' +
          'PROMPT_COMMAND="promptCommand" bash',
      ],
      {
        cols: size[0],
        rows: size[1],
        env: process.env as {[key: string]: string},
      }
    );

    child.on('data', (d: string | Uint8Array) => {
      this.lineProcessor.process(d.toString());
      process.stdout.write(d);
    });

    process.stdout.on('resize', () => {
      const columns = process.stdout.columns;
      const rows = process.stdout.rows;
      if (rows && columns) {
        child.resize(process.stdout.columns, process.stdout.rows);
      }
    });

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);

    process.stdin.on('data', (d: string | Uint8Array) => {
      child.write(d.toString());
    });

    child.onExit(() => {
      process.stdin.setRawMode(isRaw);
      exit(0);
    });

    //TODO handle resizing of term
  }
}
