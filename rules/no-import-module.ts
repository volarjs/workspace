import type { Rule } from '../framework/packages/language-service';
import type { Provide } from '../services/packages/typescript';

export default (moduleName: string, replaceModuleName?: string): Rule<Provide> => ({
	run(document, { report, inject }) {

		const ts = inject('typescript/typescript');
		const sourceFile = inject('typescript/sourceFile', document);
		if (!sourceFile)
			return;

		sourceFile.forEachChild(function visit(node) {
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				node.moduleSpecifier.text === moduleName
			) {
				report({
					message: `Importing from "${moduleName}" is not allowed`,
					range: {
						start: document.positionAt(node.moduleSpecifier.getStart(sourceFile)),
						end: document.positionAt(node.moduleSpecifier.getEnd()),
					},
					severity: 1,
				}, ...!replaceModuleName ? [] : [{
					kinds: ['quickfix'],
					title: `Replace with "${replaceModuleName}"`,
					getEdits: () => [{
						range: {
							start: document.positionAt(node.moduleSpecifier.getStart(sourceFile) + 1),
							end: document.positionAt(node.moduleSpecifier.getEnd() - 1),
						},
						newText: replaceModuleName,
					}],
				}]);
			}
			node.forEachChild(visit);
		});
	},
});
