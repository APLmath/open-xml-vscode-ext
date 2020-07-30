import * as vscode from 'vscode';
import * as OxmlModel from './OxmlModel';

export class OxmlPackageManager {
  private _zipMap: Map<string, Promise<OxmlModel.Package>> = new Map();

  async getPackage(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
    const packageUriString = packageUri.toString();
    let oxmlPackagePromise = this._zipMap.get(packageUriString);
    if (!oxmlPackagePromise) {
      async function createPackagePromise(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
        const rawData = await vscode.workspace.fs.readFile(packageUri);
        return await OxmlModel.Package.fromUint8Array(rawData);
      }
      oxmlPackagePromise = createPackagePromise(packageUri);
      this._zipMap.set(packageUriString, oxmlPackagePromise);
    }
    return oxmlPackagePromise;
  }
}