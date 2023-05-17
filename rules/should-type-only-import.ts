import type { Rule } from '../framework/packages/language-service';
import type { Provide } from '../services/packages/typescript';

export default (moduleName: string): Rule<Provide> => ({
	run(document, { report, inject }) {

		const ts = inject('typescript/typescript');
		const sourceFile = inject('typescript/sourceFile', document);
		if (!sourceFile)
			return;

		sourceFile.forEachChild(function visit(node) {
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				node.moduleSpecifier.text === moduleName &&
				node.importClause &&
				!node.importClause.isTypeOnly
			) {
				const { importClause } = node;
				report({
					message: `Importing from "${moduleName}" should be type only`,
					range: {
						start: document.positionAt(importClause.getStart(sourceFile)),
						end: document.positionAt(importClause.getEnd()),
					},
					severity: 1,
				}, {
					kinds: ['quickfix'],
					title: 'Add "import type"',
					getEdits: () => [{
						range: {
							start: document.positionAt(importClause.getStart(sourceFile)),
							end: document.positionAt(importClause.getStart(sourceFile)),
						},
						newText: importClause.getLeadingTriviaWidth() >= 1 ? 'type ' : ' type ',
					}],
				});
			}
			node.forEachChild(visit);
		});
	},
});
