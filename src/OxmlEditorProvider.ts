import * as vscode from 'vscode';

export class OxmlEditorProvider implements vscode.CustomReadonlyEditorProvider<OxmlDocument> {

    static viewType = "open-xml-vscode-ext.oxml-file-editor";

	public static register(context: vscode.ExtensionContext): vscode.Disposable {

		return vscode.window.registerCustomEditorProvider(
			this.viewType,
			new OxmlEditorProvider(),   
			{
				supportsMultipleEditorsPerDocument: false,
			});
	}
    
    public  openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): OxmlDocument
    {   
        return new OxmlDocument(uri);
    }

	async resolveCustomEditor(
		document: OxmlDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
    ): Promise<void>
    {
        webviewPanel.webview.html = "\
        <h1>Open XML File</h1>\
        <p>Your file has been opened in the Open XML Documents Window in the Explorer.</p>\
        <p>Expand the file and you can edit the file sections as XML files.</p>";

        vscode.commands.executeCommand("open-xml-vscode-ext.open-in-workspace", document.uri);
	}


}

class OxmlDocument implements vscode.CustomDocument {
    constructor (readonly uri: vscode.Uri) {}
    dispose() {};
}
