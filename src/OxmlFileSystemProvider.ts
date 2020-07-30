import * as vscode from 'vscode';
import { OxmlUri } from './OxmlUri';
import * as OxmlModel from './OxmlModel';
import { OxmlPackageManager } from './OxmlPackageManager';

export class OxmlFileSystemProvider implements vscode.FileSystemProvider {
  private async _savePackage(packageUri: vscode.Uri, oxmlPackage: OxmlModel.Package) {
    const data = await oxmlPackage.toUint8Array();
    vscode.workspace.fs.writeFile(packageUri, data);
  }

  constructor(private _packageManager: OxmlPackageManager) {
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

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    let pathWithTrailingSlash = oxmlUri.partName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const matches = entryNames.filter((name) => (name + '/').startsWith(pathWithTrailingSlash));

    if (matches.length === 1 && matches[0] + '/' === pathWithTrailingSlash) {
      return {
        type: vscode.FileType.File,
        ctime: 0,
        mtime: 0,
        size: oxmlPackage.getEntryData(oxmlUri.partName).length,
      };
    } else if (matches.length > 0) {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: matches.length,
      };
    } else {
      throw vscode.FileSystemError.FileNotFound();
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    let pathWithTrailingSlash = oxmlUri.partName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const children = new Map<string, vscode.FileType>();
    entryNames.forEach((name) => {
      if (name.startsWith(pathWithTrailingSlash)) {
        const remainderPath = name.substring(pathWithTrailingSlash.length);
        const pathComponents = remainderPath.split('/');
        const childName = pathComponents[0];
        children.set(childName, pathComponents.length === 1 ? vscode.FileType.File : vscode.FileType.Directory);
      }
    });

    if (children.size === 0) {
      throw vscode.FileSystemError.FileNotFound();
    }

    return Array.from(children);
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);
    try {
      const data = oxmlPackage.getEntryData(oxmlUri.partName);
      return data;
    }
    catch {
      throw vscode.FileSystemError.FileNotFound();
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    oxmlPackage.writeEntryData(oxmlUri.partName, content);

    this._savePackage(oxmlUri.packageUri, oxmlPackage);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean; }): Promise<void> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    const pathWithTrailingSlash = oxmlUri.partName + (oxmlUri.partName.endsWith('/') ? '' : '/');

    const entryNames = oxmlPackage.getAllEntryNames();
    let entriesToDelete = entryNames.filter((name) => options.recursive ? (name + '/').startsWith(pathWithTrailingSlash) : (name + '/') === pathWithTrailingSlash);

    if (entriesToDelete.length === 0) {
      throw vscode.FileSystemError.FileNotFound();
    }

    oxmlPackage.removeEntries(entriesToDelete);

    this._savePackage(oxmlUri.packageUri, oxmlPackage);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
    console.log(options);
    const oldOxmlUri = OxmlUri.fromUri(oldUri);
    const newOxmlUri = OxmlUri.fromUri(newUri);
    if (oldOxmlUri.packageUri.toString() !== newOxmlUri.packageUri.toString()) {
      throw new Error('Renames can only happen within the same package.');
    }

    const oxmlPackage = await this._packageManager.getPackage(oldOxmlUri.packageUri);
    const data = oxmlPackage.getEntryData(oldOxmlUri.partName);
    oxmlPackage.writeEntryData(newOxmlUri.partName, data);
    oxmlPackage.removeEntries([oldOxmlUri.partName]);

    this._savePackage(oldOxmlUri.packageUri, oxmlPackage);
  }
}
