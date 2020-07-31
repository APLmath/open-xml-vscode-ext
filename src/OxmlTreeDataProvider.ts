import * as vscode from 'vscode';
import {OxmlUri} from './OxmlUri';
import { OxmlFileSystemProvider } from './OxmlFileSystemProvider';

interface PackageInfo {
    oxmlUri: OxmlUri,
    fileName: string
}

export class OxmlTreeDataProvider implements vscode.TreeDataProvider<OxmlTreeItem> 
{
	private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
	readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

	public refresh(): any {
		this._onDidChangeTreeData.fire(undefined);
	}

    private oxmlPackages: PackageInfo[];

    constructor (private oxmlFileSystemProvider : OxmlFileSystemProvider)
    {
        this.oxmlPackages = [];

        
    }

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

            let contents = await this.oxmlFileSystemProvider.readDirectory(element.oxmlUri.toUri());
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

    static register(context: vscode.ExtensionContext, oxmlFileSystemProvider: OxmlFileSystemProvider): OxmlTreeDataProvider {
        const treeDataProvider = new OxmlTreeDataProvider(oxmlFileSystemProvider);
        context.subscriptions.push(vscode.window.registerTreeDataProvider(
            'open-xml-vscode-ext.open-xml-documents',
            treeDataProvider
        ));

        const treeView: vscode.TreeView<OxmlTreeItem> = vscode.window.createTreeView('open-xml-vscode-ext.open-xml-documents', {
            showCollapseAll: true,
            treeDataProvider: treeDataProvider
        });

        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor)
            {
                const editorUri = editor.document.uri;

                const selectedItem = OxmlTreeContent.fromOxmlUri(OxmlUri.fromUri(editorUri));
                treeView.reveal(selectedItem);
            }
        }));

        return treeDataProvider;
    }
 
}

interface TreeItem extends vscode.TreeItem {
    oxmlUri: OxmlUri;
}

interface TreePackage extends TreeItem {
    type: 'package',
}

interface TreeDirectory extends TreeItem {
     type: 'directory',
}

interface TreeContent extends TreeItem {
     type: 'content'
}

type OxmlTreeItem = TreePackage | TreeDirectory | TreeContent;

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