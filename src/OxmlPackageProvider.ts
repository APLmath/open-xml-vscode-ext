import * as vscode from 'vscode';
import { OxmlUri } from './OxmlUri';
import * as OxmlModel from './OxmlModel';
import { OxmlPackageManager } from './OxmlPackageManager';
import { toNamespacedPath } from 'path';

interface PackageInfo {
  oxmlUri: OxmlUri,
  fileName: string
}

interface IOxmlTreeItem extends vscode.TreeItem {
  oxmlUri: OxmlUri;
}

interface TreePackage extends IOxmlTreeItem {
  type: 'package',
}

interface TreeDirectory extends IOxmlTreeItem {
  type: 'directory',
}

interface TreeContent extends IOxmlTreeItem {
  type: 'content'
}

type OxmlTreeItem = TreePackage | TreeDirectory | TreeContent;

export class OxmlPackageProvider implements vscode.FileSystemProvider, vscode.TreeDataProvider<OxmlTreeItem> {

  constructor(private _packageManager: OxmlPackageManager) {
  }

  /**
   * General functions.
   */

  private _isLeaf(oxmlUri: OxmlUri): boolean {
    return !oxmlUri.entryName.endsWith('/');
  }

  // Returns array of strings of immediate child names, but with trailing slash if child is directory.
  private async _getChildNames(oxmlUri: OxmlUri): Promise<string[]> {
    if (this._isLeaf(oxmlUri)) {
      throw new Error(`URI ${oxmlUri.toUri().toString()} is a leaf node.`);
    }

    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    let pathWithTrailingSlash = oxmlUri.entryName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const children = new Set<string>();
    entryNames.forEach((entryName) => {
      if (entryName.startsWith(pathWithTrailingSlash)) {
        const remainderPath = entryName.substring(pathWithTrailingSlash.length);
        const pathComponents = remainderPath.split('/');
        const childName = pathComponents[0];
        children.add(childName + (pathComponents.length === 1 ? '' : '/'));
      }
    });

    return Array.from(children);
  }

  register(context: vscode.ExtensionContext): vscode.Disposable {
    const disposables:vscode.Disposable[] = [];

    disposables.push(vscode.workspace.registerFileSystemProvider(OxmlUri.SCHEME, this));

    disposables.push(vscode.window.registerTreeDataProvider('open-xml-vscode-ext.open-xml-documents', this));

    const treeView: vscode.TreeView<OxmlTreeItem> = vscode.window.createTreeView('open-xml-vscode-ext.open-xml-documents', {
        showCollapseAll: true,
        treeDataProvider: this
    });

    disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor)
      {
        const editorUri = editor.document.uri;

        const selectedItem = OxmlTreeContent.fromOxmlUri(OxmlUri.fromUri(editorUri));
        treeView.reveal(selectedItem);
      }
    }));

    return vscode.Disposable.from(...disposables);
  }

  async openPackage(packageUri: vscode.Uri) {
    this._packageManager;
  }

  /**
   * vscode.FileSystemProvider implementations.
   */

  private async _savePackage(packageUri: vscode.Uri, oxmlPackage: OxmlModel.Package) {
    const data = await oxmlPackage.toUint8Array();
    vscode.workspace.fs.writeFile(packageUri, data);
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

    let pathWithTrailingSlash = oxmlUri.entryName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const matches = entryNames.filter((name) => (name + '/').startsWith(pathWithTrailingSlash));

    if (this._isLeaf(oxmlUri)) {
      return {
        type: vscode.FileType.File,
        ctime: 0,
        mtime: 0,
        size: oxmlPackage.getEntryData(oxmlUri.entryName).length,
      };
    } else {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: (await this._getChildNames(oxmlUri)).length,
      }
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const oxmlUri = OxmlUri.fromUri(uri);

    if (this._isLeaf(oxmlUri)) {
      throw new Error(`URI ${oxmlUri.toUri().toString()} is a not a directory.`);
    }

    const childNames = await this._getChildNames(oxmlUri);
    const children:[string, vscode.FileType][] = childNames.map((childName) => childName.endsWith('/')
      ? [childName.substring(0, childName.length - 1), vscode.FileType.Directory]
      : [childName, vscode.FileType.File]);

    return children;
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    throw vscode.FileSystemError.NoPermissions('Readonly to start');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);
    try {
      const data = oxmlPackage.getEntryData(oxmlUri.entryName);
      return data;
    }
    catch {
      throw vscode.FileSystemError.FileNotFound();
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    oxmlPackage.writeEntryData(oxmlUri.entryName, content);

    this._savePackage(oxmlUri.packageUri, oxmlPackage);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean; }): Promise<void> {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    const pathWithTrailingSlash = oxmlUri.entryName + (oxmlUri.entryName.endsWith('/') ? '' : '/');

    const entryNames = oxmlPackage.getAllEntryNames();
    let entriesToDelete = entryNames.filter((name) => options.recursive ? (name + '/').startsWith(pathWithTrailingSlash) : (name + '/') === pathWithTrailingSlash);

    if (entriesToDelete.length === 0) {
      throw vscode.FileSystemError.FileNotFound();
    }

    oxmlPackage.removeEntries(entriesToDelete);

    this._savePackage(oxmlUri.packageUri, oxmlPackage);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
    const oldOxmlUri = OxmlUri.fromUri(oldUri);
    const newOxmlUri = OxmlUri.fromUri(newUri);
    if (oldOxmlUri.packageUri.toString() !== newOxmlUri.packageUri.toString()) {
      throw new Error('Renames can only happen within the same package.');
    }

    const oxmlPackage = await this._packageManager.getPackage(oldOxmlUri.packageUri);
    const data = oxmlPackage.getEntryData(oldOxmlUri.entryName);
    oxmlPackage.writeEntryData(newOxmlUri.entryName, data);
    oxmlPackage.removeEntries([oldOxmlUri.entryName]);

    this._savePackage(oldOxmlUri.packageUri, oxmlPackage);
  }

  /**
   * vscode.TreeDataProvider implementations.
   */

  private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
  readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

  public refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  private oxmlPackages: PackageInfo[] = [];

  getTreeItem(element: OxmlTreeItem): OxmlTreeItem {
    return element;
  }

  async getChildren(element?: OxmlTreeItem): Promise<OxmlTreeItem[]> {
    if (!element) {
      let packages: OxmlTreePackage[] = [];
      this.oxmlPackages.forEach((oxmlPackage) => {
        packages.push(new OxmlTreePackage(oxmlPackage));
      });
      return Promise.resolve(packages);
    }
    else if (element.type === 'package' || element.type === 'directory') {
      let items : OxmlTreeItem[] = [];

      let contents = await this.readDirectory(element.oxmlUri.toUri());
      // Sort directories ahead of files, then alphabetically.
      contents.sort((content1, content2) => {
        const type1 = content1[1] & ~vscode.FileType.SymbolicLink;
        const type2 = content2[1] & ~vscode.FileType.SymbolicLink;
        if (type1 != type2) {
          return type1 == vscode.FileType.Directory ? -1 : 1;
        }

        const name1 = content1[0];
        const name2 = content2[0];
        if (name1 < name2) {
          return -1;
        } if (name1 > name2) {
          return 1;
        } else {
          return 0;
        }
      });
      contents.forEach((item) => {
        if (item[1] === vscode.FileType.Directory) {
          items.push(new OxmlTreeDirectory(item[0], element.oxmlUri));
        }
        else {
          items.push(new OxmlTreeContent(item[0], element.oxmlUri));
        }
      });
      return items;
    }
    else {
      return Promise.resolve([]);
    }
  }

  async getParent(element: OxmlTreeItem): Promise<OxmlTreeItem | null> {
      const oxmlUri = element.oxmlUri;
      if (oxmlUri.entryName === '/')
      {
          return null;
      }

      let parentEntry = oxmlUri.entryName;
      if (parentEntry.endsWith('/')) {
          parentEntry = parentEntry.substring(0, parentEntry.length - 1);
      }
      const lastSlashIndex = parentEntry.lastIndexOf('/');
      parentEntry = parentEntry.substring(0, lastSlashIndex + 1);

      const parentOxmlUri = new OxmlUri(oxmlUri.packageUri, parentEntry);
      if (parentEntry === '') {
          const pkgInfo = this.oxmlPackages.find((pkg) => pkg.oxmlUri.toUri().toString() === parentOxmlUri.toUri().toString())
          if (!pkgInfo) {
              throw new Error(`package with URI ${parentOxmlUri.packageUri.toString()} not found.`);
          }
          return new OxmlTreePackage(pkgInfo);
      } else {
          parentEntry = parentEntry.substring(0, parentEntry.length - 1);
          const lastSlashIndex2 = parentEntry.lastIndexOf('/');
          const parentParentEntry = parentEntry.substring(0, lastSlashIndex2 + 1);
          const name = parentEntry.substring(lastSlashIndex2 + 1);
          return new OxmlTreeDirectory(name, new OxmlUri(oxmlUri.packageUri, parentParentEntry));
      }
  }

  addOxmlPackage(uri: vscode.Uri) : void {
      const newFileName = uri.toString().split('#').shift()?.split('?').shift()?.split('/').pop();
      const newPackageInfo = { oxmlUri : new OxmlUri(uri, '/'), fileName: newFileName ? newFileName : uri.toString() };
      let wasAdded = false;
      
      if (newFileName) {
          const length = this.oxmlPackages.length;
          const newComparisonName = newFileName.toLowerCase();
          let previousComparisonName = '';

          for (let i = 0; i < length; i += 1) {
              const currentPackage = this.oxmlPackages[i];
              if ((currentPackage.fileName === undefined) ||
                 ((previousComparisonName < newComparisonName) && (newComparisonName < currentPackage.fileName.toLowerCase())))
               {
                  this.oxmlPackages.splice(i, 0, newPackageInfo);
                  wasAdded = true;
                  break;
              }
          }
      }
      if (!wasAdded) {
          this.oxmlPackages.push(newPackageInfo);
      }
      this.refresh();
  }

  closeOxmlPackage(oxmlUri: OxmlUri) : void {
      const length = this.oxmlPackages.length;
      for (let i = 0; i < length; i += 1) {
          if (this.oxmlPackages[i].oxmlUri === oxmlUri) {
              this.oxmlPackages.splice(i, 1);
              break;
          }
      }
      this.refresh();
  }
}

export class OxmlTreePackage extends vscode.TreeItem implements TreePackage {
    public type : 'package' = 'package';
    public oxmlUri : OxmlUri;
    public get id() {
        return this.oxmlUri.toUri().toString();
    }
    public iconPath = new vscode.ThemeIcon('package');

    constructor(packageInfo: PackageInfo) {
        super(packageInfo.fileName, vscode.TreeItemCollapsibleState.Collapsed);
        this.oxmlUri = packageInfo.oxmlUri;
        this.contextValue = 'oxmlPackage';
    }
}

class OxmlTreeDirectory extends vscode.TreeItem implements TreeDirectory {
    public type: 'directory' = 'directory';
    public oxmlUri: OxmlUri;
    public get id() {
        return this.oxmlUri.toUri().toString();
    }

    constructor(name: string, parentOxmlUri: OxmlUri) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.oxmlUri = new OxmlUri(parentOxmlUri.packageUri, parentOxmlUri.entryName + name + '/');
    }
}

class OxmlTreeContent extends vscode.TreeItem {
    public type: 'content' = 'content';
    public oxmlUri: OxmlUri;
    public get id() {
        return this.oxmlUri.toUri().toString();
    }

    constructor(name: string, parentOxmlUri: OxmlUri) {
        super(name);
        this.oxmlUri = new OxmlUri(parentOxmlUri.packageUri, parentOxmlUri.entryName + name);
        this.resourceUri = this.oxmlUri.toUri();
        this.command = {
            command: 'vscode.open',
            arguments: [ this.resourceUri],
            title: "Open OXML Content"
        };  
    }

    static fromOxmlUri(oxmlUri: OxmlUri): OxmlTreeContent {
        const entryName = oxmlUri.entryName;
        const lastSlashIndex = entryName.lastIndexOf('/');
        const parentEntryName = entryName.substring(0, lastSlashIndex + 1);
        const name = entryName.substring(lastSlashIndex + 1);
        const parentOxmlUri = new OxmlUri(oxmlUri.packageUri, parentEntryName);

        const content = new OxmlTreeContent(name, parentOxmlUri);
        return content;
    }
}
