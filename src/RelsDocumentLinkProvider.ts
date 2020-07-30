import * as vscode from 'vscode';
import * as sax from 'sax';
import { OxmlUri } from './OxmlUri';


// Missing declaration... really?
declare module 'sax' {
  interface SAXParser {
    onopentagstart(tag: Tag | QualifiedTag): void;
  }
}


export class RelsDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
    const documentLinks: vscode.DocumentLink[] = [];

    const rawText = document.getText();
    let parser = new sax.SAXParser(true, {xmlns: false, position: true});

    // onattribute is invoked after the tag is closed, especially for xmlns turned on. So we need to manually find the range by keeping track of when the tag starts
    // See https://github.com/isaacs/sax-js/issues/181
    let currentRelStart = 0;
    parser.onopentagstart = (tag) => {
      if (tag.name === 'Relationship') {
        currentRelStart = parser.position;
      }
    };

    parser.onattribute = (attr) => {
      if (parser.tag.name === 'Relationship' && attr.name === 'Target') {
        let currentRelEnd = parser.position; // The target is between currentRelStart and currentRelEnd at this point

        // Much hard-coded math assuming that it will be in the form <Relationship Target="../path/to/part.xml">
        let attributesString = rawText.substring(currentRelStart, currentRelEnd);
        let targetValueOffsetStart = attributesString.indexOf('Target="') + 8;
        let targetValueLength = attributesString.substring(targetValueOffsetStart).indexOf('"');

        //console.dir(rawText.substr(currentRelStart + targetValueOffsetStart, targetValueLength));
        const start = document.positionAt(currentRelStart + targetValueOffsetStart);
        const end = document.positionAt(currentRelStart + targetValueOffsetStart + targetValueLength);
        const range = new vscode.Range(start, end);
        
        // Compute target Uri
        const relativePath = '../../' + document.getText(range); // Need to splice two parent hops. 1 to get to the _rels folder, then one more to get to the level where the source part was.
        const targetUri = vscode.Uri.joinPath(document.uri, relativePath);

        const documentLink = new vscode.DocumentLink(range, targetUri);
        documentLinks.push(documentLink);
      }
    };

    parser.write(rawText).end();

    return documentLinks;
  }

  static register(context: vscode.ExtensionContext) {
    const disposable = vscode.languages.registerDocumentLinkProvider({scheme: OxmlUri.SCHEME, pattern: "**/*.rels"}, new RelsDocumentLinkProvider());
    context.subscriptions.push(disposable);
  }
}

// cspell:ignore onattribute onopentagstart