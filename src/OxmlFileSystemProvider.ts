import * as vscode from 'vscode'
import * as yauzl from 'yauzl-promise'
import { OxmlUri } from './OxmlUri';

interface EntryFile {
  type: 'FILE';
  uri: OxmlUri;
  data: Uint8Array;
  size: number;
};

interface EntryDirectory {
  type: 'DIRECTORY';
  children: Map<string, EntryDirectory | EntryFile>;
};

async function expandPackage(packageUri: vscode.Uri): Promise<EntryDirectory> {
  const zippedPackage = await yauzl.open(packageUri.path);
  let packageDirectory: EntryDirectory = {
    type: 'DIRECTORY',
    children: new Map()
  };
  let entry: yauzl.Entry | null = null;
  while (entry = await zippedPackage.readEntry()) {
    const pathComponents = entry.fileName.split('/');
    let currentDirectory = packageDirectory;
    for (let i = 0; i < pathComponents.length - 1; i++) {
      const directoryName = pathComponents[i];
      let childDirectory = <EntryDirectory | undefined>currentDirectory.children.get(directoryName);
      if (!childDirectory) {
        childDirectory = {
          type: 'DIRECTORY',
          children: new Map()
        };
        currentDirectory.children.set(directoryName, childDirectory);
      }
      currentDirectory = childDirectory;
    }

    let stream = await entry.openReadStream();
    let chunks = [];
    for await (let chunk of stream) {
      chunks.push(chunk);
    }
    let buffer = Buffer.concat(chunks);
    const data = new Uint8Array(buffer.buffer);

    currentDirectory.children.set(pathComponents[pathComponents.length - 1], {
      type: 'FILE',
      uri: new OxmlUri(packageUri, '/' + entry.fileName),
      data: data,
      size: entry.uncompressedSize
    });
  }
  zippedPackage.close();

  return packageDirectory;
}

function traverseEntryDirectory(startingDirectory: EntryDirectory, path: string): EntryDirectory | EntryFile {
  let normalizedPath = path;
  if (!normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath + '/';
  }

  let pathComponents = normalizedPath.split('/'); // ignore first and last components, they will be empty.
  pathComponents = pathComponents.slice(1, pathComponents.length - 1);

  let currentEntry: EntryDirectory | EntryFile = startingDirectory;
  for (let i = 0; i < pathComponents.length; i++) {
    const pathComponent = pathComponents[i];
    if (currentEntry.type !== 'DIRECTORY') {
      throw vscode.FileSystemError.FileNotFound;
    }
    const childEntry = currentEntry.children.get(pathComponent);
    if (!childEntry) {
      throw vscode.FileSystemError.FileNotFound;
    }
    currentEntry = childEntry;
  }

  return currentEntry;
}

export class OxmlFileSystemProvider implements vscode.FileSystemProvider {
  private _zipMap: Map<string, Promise<EntryDirectory>> = new Map();
  private async _getPackage(packageUri: vscode.Uri): Promise<EntryDirectory> {
    const packageUriString = packageUri.toString();
    let packageDirectory = this._zipMap.get(packageUriString);
    if (!packageDirectory) {
      packageDirectory = expandPackage(packageUri);
      this._zipMap.set(packageUriString, packageDirectory);
    }
    return packageDirectory;
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
    const packageDirectory = await this._getPackage(oxmlUri.packageUri);
    const entry = traverseEntryDirectory(packageDirectory, oxmlUri.partName);
    console.log('==================');
    console.log(oxmlUri.partName);
    console.log(entry);

    return {
      type: entry.type === 'DIRECTORY' ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: entry.type === 'DIRECTORY' ? entry.children.size : entry.size,
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const packageDirectory = await this._getPackage(oxmlUri.packageUri);
    const entry = traverseEntryDirectory(packageDirectory, oxmlUri.partName);
    if (entry.type !== 'DIRECTORY') {
      throw vscode.FileSystemError.FileNotFound;
    }
    
    return Array.from(entry.children, ([key, value]) => [key, value.type === 'FILE' ? vscode.FileType.File : vscode.FileType.Directory]);
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const packageDirectory = await this._getPackage(oxmlUri.packageUri);
    const entry = traverseEntryDirectory(packageDirectory, oxmlUri.partName);
    if (entry.type !== 'FILE') {
      throw vscode.FileSystemError.FileNotFound;
    }

    return (<EntryFile>entry).data;
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
