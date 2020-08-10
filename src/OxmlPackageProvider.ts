import * as vscode from 'vscode';
import { OxmlUri } from './OxmlUri';
import * as OxmlModel from './OxmlModel';
import { OxmlPackageManager } from './OxmlPackageManager';

interface ILeafNode {
  type: 'LEAF';
}

interface IDirNode {
  type: 'DIR';
  children: [string, 'LEAF' | 'DIR'][];
}

export class OxmlPackageProvider implements vscode.FileSystemProvider, vscode.TreeDataProvider<OxmlTreeItem> {

  constructor(private _packageManager: OxmlPackageManager) {
  }

  /**
   * General functions.
   */

  // Returns array of strings of immediate child names, but with trailing slash if child is directory.
  private async _getNodeInfo(oxmlUri: OxmlUri): Promise<ILeafNode | IDirNode> {
    // if (this._isLeaf(oxmlUri)) {
    //   throw new Error(`URI ${oxmlUri.toUri().toString()} is a leaf node.`);
    // }

    const oxmlPackage = await this._packageManager.getPackage(oxmlUri.packageUri);

    let pathWithTrailingSlash = oxmlUri.entryName;
    if (!pathWithTrailingSlash.endsWith('/')) {
      pathWithTrailingSlash += '/';
    }

    const entryNames = oxmlPackage.getAllEntryNames();
    const matches: string[] = [];
    entryNames.forEach((entryName) => {
      entryName += '/';
      if (entryName.startsWith(pathWithTrailingSlash)) {
        const remainderPath = entryName.substring(pathWithTrailingSlash.length);
        matches.push(remainderPath);
      }
    });

    if (matches.length === 1 && matches[0] === '') {
      return {
        type: 'LEAF'
      };
    } else {
      const children = new Map<string, 'LEAF' | 'DIR'>();
      matches.forEach((match) => {
        match = match.substring(0, match.length - 1);
        const pathComponents = match.split('/');
        const childName = pathComponents[0];
        if (pathComponents.length === 1) {
          children.set(childName, 'LEAF');
        } else {
          children.set(childName, 'DIR');
        }
      });
      return {
        type: 'DIR',
        children: Array.from(children)
      }
    }
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

        const selectedItem = new OxmlTreeItem(OxmlUri.fromUri(editorUri), true);//OxmlTreeContent.fromOxmlUri(OxmlUri.fromUri(editorUri));
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

    const nodeInfo = await this._getNodeInfo(oxmlUri);

    if (nodeInfo.type === 'LEAF') {
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
        size: nodeInfo.children.length,
      }
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const oxmlUri = OxmlUri.fromUri(uri);

    const nodeInfo = await this._getNodeInfo(oxmlUri);

    if (nodeInfo.type === 'LEAF') {
      throw new Error(`URI ${oxmlUri.toUri().toString()} is a not a directory.`);
    }

    const children = nodeInfo.children.map(([childName, type]) => [childName, type === 'LEAF' ? vscode.FileType.File : vscode.FileType.Directory] as [string, vscode.FileType]);
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

  getTreeItem(element: OxmlTreeItem): OxmlTreeItem {
    return element;
  }

  async getChildren(element?: OxmlTreeItem): Promise<OxmlTreeItem[]> {
    if (!element) {
      const openedPackagesUris = this._packageManager.getOpenedPackagesUris();
      const children = openedPackagesUris.map((packageUri) => new OxmlTreeItem(new OxmlUri(packageUri, '/'), false));
      return children;
    } else {
      const oxmlUri = element.oxmlUri;
      const nodeInfo = await this._getNodeInfo(oxmlUri);

      if (nodeInfo.type === 'LEAF') {
        throw new Error('This is a leaf node.');
      }

      const children = nodeInfo.children.map(([childName, type]) => new OxmlTreeItem(OxmlUri.fromUri(vscode.Uri.joinPath(oxmlUri.toUri(), childName)), type === 'LEAF'));
      const sortedChildren = children.sort((item1, item2) => item1.compareTo(item2));
      return sortedChildren;
    }
  }

  async getParent(element: OxmlTreeItem): Promise<OxmlTreeItem | null> {
    const oxmlUri = element.oxmlUri;
    if (oxmlUri.entryName === '/')
    {
        return null;
    }

    const tempUri = vscode.Uri.joinPath(oxmlUri.toUri(), '..');
    const parentOxmlUri = OxmlUri.fromUri(tempUri);
    return new OxmlTreeItem(parentOxmlUri, false);
  }

  addOxmlPackage(packageUri: vscode.Uri) : void {
    const isPackageAlreadyOpened = this._packageManager.getOpenedPackagesUris().some((openedPackageUri) => openedPackageUri.toString() === packageUri.toString());
    if (!isPackageAlreadyOpened) {
      this._packageManager.openPackage(packageUri);
      this.refresh();
    }
  }

  closeOxmlPackage(oxmlUri: OxmlUri) : void {
    this._packageManager.closePackage(oxmlUri.packageUri);
    this.refresh();
  }
}

export interface IOxmlTreeItem {
  oxmlUri: OxmlUri;
}

class OxmlTreeItem extends vscode.TreeItem implements IOxmlTreeItem {
  private get _isPackage() {
    return this.oxmlUri.entryName === '/';
  }

  private get _isLeaf() {
    return this.collapsibleState === vscode.TreeItemCollapsibleState.None;
  }

  public get id() {
    return this.oxmlUri.toUri().toString();
  }

  public get iconPath() {
    return this._isPackage ? new vscode.ThemeIcon('package') : undefined;
  }

  public get contextValue() {
    return this._isPackage ? 'oxmlPackage' : undefined;
  }

  public get command() {
    return this._isLeaf ? {
      command: 'vscode.open',
      arguments: [this.resourceUri],
      title: "Open OXML Content"
    } : undefined;
  }

  public compareTo(other: OxmlTreeItem): number {
    if (this._isLeaf != other._isLeaf) {
      return this._isLeaf ? 1 : -1;
    } else {
      if (this.id < other.id) {
        return -1;
      } else if (this.id > other.id) {
        return 1;
      } else {
        return 0;
      }
    }
  }

  constructor(readonly oxmlUri: OxmlUri, isLeaf: boolean) {
    super(oxmlUri.toUri(), isLeaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
  }
}
