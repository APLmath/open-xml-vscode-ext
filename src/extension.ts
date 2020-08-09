// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {OxmlUri} from './OxmlUri';
import {OxmlPackageProvider} from './OxmlFileSystemProvider';
import { OxmlEditorProvider } from './OxmlEditorProvider';
import { RelsDocumentLinkProvider } from './RelsDocumentLinkProvider';
import { OxmlPackageManager } from './OxmlPackageManager';
import { OxmlTreeDataProvider, OxmlTreePackage } from './OxmlTreeDataProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const packageManager = new OxmlPackageManager();

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.quick-navigate-relationship', async (uri:vscode.Uri) => {
    const oxmlUri = OxmlUri.fromUri(uri);
    const oxmlPackage = await packageManager.getPackage(oxmlUri.packageUri);

    const relationships = oxmlPackage.getRelationships(oxmlUri.entryName);
    const sortedRelationships = relationships.sort((r1, r2) => {
      const name1 = r1.targetName;
      const name2 = r2.targetName;

      if (name1 < name2) {
        return -1;
      } else if (name1 > name2) {
        return 1;
      } else {
        return 0;
      }
    });

    const quickPickItems = sortedRelationships.map((relationship) => {
      return {
        label: relationship.targetName,
        description: relationship.id,
        detail: relationship.type,
      };
    });

    let pickedItem = await vscode.window.showQuickPick(quickPickItems, {
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: quickPickItems.length > 0 ? 'Jump to related part...' : 'This part has no outgoing relationships'
    });
    if (pickedItem) {
      const targetUri = new OxmlUri(oxmlUri.packageUri, pickedItem.label);
      vscode.commands.executeCommand('vscode.open', targetUri.toUri());
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.open-package-externally', async (oxmlPackage: OxmlTreePackage) => {
    vscode.env.openExternal(oxmlPackage.oxmlUri.packageUri);
  }));

  const oxmlPackageProvider = new OxmlPackageProvider(packageManager);
  context.subscriptions.push(oxmlPackageProvider.register(context));

  context.subscriptions.push(OxmlEditorProvider.register(context));

  RelsDocumentLinkProvider.register(context);

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.open-in-workspace', (uri:vscode.Uri) => {
    if (uri) {
      const pathComponents = uri.path.split('/');
      oxmlPackageProvider.addOxmlPackage(uri);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.close-oxml-package', (pkg: OxmlTreePackage ) => {
    if (pkg) {
      oxmlPackageProvider.closeOxmlPackage(pkg.oxmlUri);
    }
  }));



}

// this method is called when your extension is deactivated
export function deactivate() {}
