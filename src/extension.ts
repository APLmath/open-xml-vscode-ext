// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {OxmlUri} from './OxmlUri';
import {OxmlFileSystemProvider} from './OxmlFileSystemProvider';
import * as yauzl from 'yauzl-promise';
import {promises as fsPromises} from 'fs';
import { OxmlEditorProvider } from './OxmlEditorProvider';
import { RelsDocumentLinkProvider } from './RelsDocumentLinkProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "open-xml-vscode-ext" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.open-in-workspace', (uri:vscode.Uri) => {
    if (uri) {
      const pathComponents = uri.path.split('/');
      vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length || 0, 0, {
        uri: new OxmlUri(uri, '/').toUri(),
        name: pathComponents[pathComponents.length - 1]
      });
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('open-xml-vscode-ext.scratchpad', async (uri:vscode.Uri) => {
    const zippy = await yauzl.open('/Users/andlee/Downloads/oxml-icon.pptx');
    // const entry = await zippy.readEntry();
    // let stream = await entry.openReadStream();
    // //stream.setEncoding('utf-8');

    // let chunks = [];
    // for await (let chunk of stream) {
    //   chunks.push(chunk);
    // }
    // console.log(chunks);
    const entries = await zippy.readEntries();
    entries.forEach((entry) => {console.log(entry);});
  }));

  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(OxmlUri.SCHEME, new OxmlFileSystemProvider()));

  context.subscriptions.push(OxmlEditorProvider.register(context));

  RelsDocumentLinkProvider.register(context);
}

// this method is called when your extension is deactivated
export function deactivate() {}
