import * as vscode from 'vscode';
import {OxmlUri} from './OxmlUri';
import { OxmlFileSystemProvider } from './OxmlFileSystemProvider';

interface PackageInfo {
    oxmlUri: OxmlUri,
    fileName: string
}

export class OxmlTreeDataProvider implements vscode.TreeDataProvider<OxmlItem> 
{
    private oxmlPackages: PackageInfo[];


    constructor (private oxmlFileSystemProvider : OxmlFileSystemProvider)
    {
        this.oxmlPackages = [];

        // Test code, add a couple of fake packages
        this.addOxmlPackage(vscode.Uri.file('/d:/foo/foo.docx'));
        this.addOxmlPackage(vscode.Uri.file('/d:/foo/Empty.pptx'));

    }

    getTreeItem(element: OxmlItem): OxmlItem {
        return element;
      }

    async getChildren(element?: OxmlItem): Promise<OxmlItem[]> {
        if (!element) {
            let packages: OxmlPackage[] = [];
            this.oxmlPackages.forEach((oxmlPackage) => {
                packages.push(new OxmlPackage(oxmlPackage));
            });
            return Promise.resolve(packages);
        }
        else if (element.type === 'package' || element.type === 'directory') {
            let items : OxmlItem[] = [];
            console.log('Before');

            let contents = await this.oxmlFileSystemProvider.readDirectory(element.oxmlUri.toUri());
            contents.forEach((item) => {
                if (item[1] === vscode.FileType.Directory) {
                    items.push(new OxmlDirectory(item[0], element.oxmlUri));
                }
                else {
                    items.push(new OxmlContent(item[0], element.oxmlUri));
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
                if (currentPackage.fileName === undefined) {
                    this.oxmlPackages.splice(i, 0, newPackageInfo);
                    wasAdded = true;
                    break;
                }
                if ((previousComparisonName < newComparisonName) && (newComparisonName < currentPackage.fileName.toLowerCase()))
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
    }
}

interface Item extends vscode.TreeItem {
    oxmlUri: OxmlUri;
}

interface Package extends Item {
    type: 'package',
}

interface Directory extends Item {
     type: 'directory',
}

interface Content extends Item {
     type: 'content'
}

type OxmlItem = Package | Directory | Content;

class OxmlPackage extends vscode.TreeItem implements Package {
    public type : 'package' = 'package';
    public oxmlUri : OxmlUri;

    constructor(packageInfo: PackageInfo) {
        super(packageInfo.fileName, vscode.TreeItemCollapsibleState.Collapsed);
        this.oxmlUri = packageInfo.oxmlUri;
    }
}

class OxmlDirectory extends vscode.TreeItem implements Directory {
    public type: 'directory' = 'directory';
    public oxmlUri: OxmlUri;

    constructor(name: string, parentOxmlUri: OxmlUri) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.oxmlUri = new OxmlUri(parentOxmlUri.packageUri, parentOxmlUri.partName + name + '/');
    }
}

class OxmlContent extends vscode.TreeItem {
    public type: 'content' = 'content';
    public oxmlUri: OxmlUri;

    constructor(name: string, parentOxmlUri: OxmlUri) {
        super(name);
        this.oxmlUri = new OxmlUri(parentOxmlUri.packageUri, parentOxmlUri.partName + name);
        this.resourceUri = this.oxmlUri.toUri();
    }
}