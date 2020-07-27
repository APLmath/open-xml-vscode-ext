import * as vscode from 'vscode'

export const SCHEME = 'oxml'; 

export class OxmlUri {
  static readonly SCHEME = 'oxml';
  readonly packageUri: vscode.Uri;

  constructor(uri: vscode.Uri, readonly partName: string) {
    if (uri.scheme !== 'file' || uri.query !== '' || uri.fragment !== '') {
      throw new Error('Must be a file Uri without a query or fragment');
    }

    this.packageUri = uri;
  }

  toUri(): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}://${this.packageUri.path}#${this.partName}`);
  }
}
