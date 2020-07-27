import * as vscode from 'vscode'

export const SCHEME = 'oxml'; 

export class OxmlUri {
  static readonly SCHEME = 'oxml';
  readonly packageUri: vscode.Uri;

  constructor(uri: vscode.Uri, readonly partName: string) {
    if (uri.scheme !== 'file' || uri.query !== '' || uri.fragment !== '' || uri.path.includes('\\')) {
      throw new Error('Must be a file Uri without a query or fragment or backslashes in the URI path');
    }

    this.packageUri = uri;
  }

  static fromUri(uri: vscode.Uri): OxmlUri {
    return new OxmlUri(vscode.Uri.parse(`file://${uri.authority.replace(/\\/g, '/')}`), uri.path);
  }

  toUri(): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}://${this.packageUri.path.replace(/\//g, '\\')}${this.partName}`);
  }
}
