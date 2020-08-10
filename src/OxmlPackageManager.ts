import * as vscode from 'vscode';
import * as OxmlModel from './OxmlModel';

export class OxmlPackageManager {
  private _packagePromiseMap: Map<string, Promise<OxmlModel.Package>> = new Map();

  async getPackage(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
    const packageUriString = packageUri.toString();
    let oxmlPackagePromise = this._packagePromiseMap.get(packageUriString);
    if (!oxmlPackagePromise) {
      throw new Error(`Package with URI ${packageUriString} has not been opened.`);
    }
    return oxmlPackagePromise;
  }

  async openPackage(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
    const packageUriString = packageUri.toString();
    if (this._packagePromiseMap.has(packageUriString)) {
      throw new Error(`Package with URI ${packageUriString} is already opened.`);
    }
    async function createPackagePromise(packageUri: vscode.Uri): Promise<OxmlModel.Package> {
      const rawData = await vscode.workspace.fs.readFile(packageUri);
      return await OxmlModel.Package.fromUint8Array(rawData);
    }
    const oxmlPackagePromise = createPackagePromise(packageUri);
    this._packagePromiseMap.set(packageUriString, oxmlPackagePromise);
    return oxmlPackagePromise;
  }

  closePackage(packageUri: vscode.Uri) {
    const packageUriString = packageUri.toString();
    this._packagePromiseMap.delete(packageUriString);
  }

  getOpenedPackagesUris(): vscode.Uri[] {
    return Array.from(this._packagePromiseMap.keys())
      .map((packageUriString) => vscode.Uri.parse(packageUriString));
  }
}