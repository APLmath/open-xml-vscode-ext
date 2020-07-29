import * as vscode from 'vscode';
import { OxmlUri } from './OxmlUri';
import * as OxmlModel from './OxmlModel';

export class OxmlFileSystemProvider implements vscode.FileSystemProvider {
  private _zipMap: Map<string, Promise<OxmlModel.Package>> = new Map();
  private async _getPackage(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
    const packageUriString = packageUri.toString();
    let oxmlPackagePromise = this._zipMap.get(packageUriString);
    if (!oxmlPackagePromise) {
      async function createPackagePromise(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
        const rawData = await vscode.workspace.fs.readFile(packageUri);
        return await OxmlModel.Package.fromUint8Array(rawData);
      }
      oxmlPackagePromise = createPackagePromise(packageUri);
      this._zipMap.set(packageUriString, oxmlPackagePromise);
    }
    return oxmlPackagePromise;
  }

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

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._getPackage(oxmlUri.packageUri);

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
    } else {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: matches.length,
      };
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._getPackage(oxmlUri.packageUri);

    let pathWithTrailingSlash = oxmlUri.partName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const children = new Map<string, vscode.FileType>();
    entryNames.forEach((name) => {
      if (name.startsWith(pathWithTrailingSlash)) {
        const remainderPath = name.substring(pathWithTrailingSlash.length)
        const pathComponents = remainderPath.split('/');
        const childName = pathComponents[0];
        children.set(childName, pathComponents.length === 1 ? vscode.FileType.File : vscode.FileType.Directory);
      }
    });

    if (children.size === 0) {
      throw vscode.FileSystemError.FileNotFound;
    }

    return Array.from(children);
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._getPackage(oxmlUri.packageUri);
    try {
      const data = oxmlPackage.getEntryData(oxmlUri.partName);
      return data;
    }
    catch {
      throw vscode.FileSystemError.FileNotFound;
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._getPackage(oxmlUri.packageUri);

    oxmlPackage.writeEntryData(oxmlUri.partName, content);

    const data = await oxmlPackage.toUint8Array();
    vscode.workspace.fs.writeFile(oxmlUri.packageUri, data);
  }

  delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }
}
