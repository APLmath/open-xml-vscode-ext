import * as vscode from 'vscode'
import { TextEncoder } from 'util';

export class OxmlFileSystemProvider implements vscode.FileSystemProvider {

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

  readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
    const encoder = new TextEncoder();
    return encoder.encode(`Hello from ${uri.toString()}`);
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
