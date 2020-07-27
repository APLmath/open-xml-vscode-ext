import * as vscode from 'vscode'

export const SCHEME = 'oxml'; 

export class OxmlUri {
  static readonly SCHEME = 'oxml';

  constructor(readonly packageUri: vscode.Uri, readonly partName: string) {
  }

  toUri(): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}://${encodeURIComponent(this.packageUri.toString())}${this.partName}`);
  }
}
