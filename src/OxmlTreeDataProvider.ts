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
            console.log('Before');

            let contents = await this.oxmlFileSystemProvider.readDirectory(element.oxmlUri.toUri());
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
                this.oxmlPackages = this.oxmlPackages.slice(i, 1);
                break;
            }
        }
        this.refresh();
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

    constructor(name: string, parentOxmlUri: OxmlUri) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.oxmlUri = new OxmlUri(parentOxmlUri.packageUri, parentOxmlUri.entryName + name + '/');
    }
}

class OxmlTreeContent extends vscode.TreeItem {
    public type: 'content' = 'content';
    public oxmlUri: OxmlUri;

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
}