import * as vscode from 'vscode'
import * as yauzl from 'yauzl-promise'
import { TextEncoder } from 'util';
import { OxmlUri } from './OxmlUri';

export class OxmlFileSystemProvider implements vscode.FileSystemProvider {
  private _zipMap: Map<string, yauzl.ZipFile> = {};

  constructor() {
  }

  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
    return {
      dispose: () => {
          /* noop */
      }
    };
  }

  stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
    return {
      type: uri.path === '/' ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0,
    };
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    if (uri.path === '/') {
      return [['[Content_Types].xml', vscode.FileType.File]];
    }
    return [];
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const oxmlUri = OxmlUri.fromUri(uri);

    const zippy = await yauzl.open(oxmlUri.packageUri.path);
    let entry: yauzl.Entry | null = null;
    while (entry = await zippy.readEntry()) {
      if (oxmlUri.partName == '/' + entry.fileName) {
        break;
      }
    }

    if (entry == null) {
      throw vscode.FileSystemError.FileNotFound;
    }

    let stream = await entry.openReadStream();
    let chunks = [];
    for await (let chunk of stream) {
      chunks.push(chunk);
    }
    let buffer = Buffer.concat(chunks);
    return new Uint8Array(buffer.buffer);
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }
}
