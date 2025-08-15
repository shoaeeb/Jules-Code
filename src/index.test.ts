import { generateDocsHtml, generateMockData, Project } from './index';

describe('generateDocsHtml', () => {
    it('should generate a basic HTML structure', () => {
        const project: Project = { modules: [] };
        const html = generateDocsHtml(project, 'test-repo');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<h1>API Documentation for test-repo</h1>');
    });

    it('should generate a module section', () => {
        const project: Project = {
            modules: [
                { name: 'module1', classes: [], interfaces: [], functions: [] }
            ]
        };
        const html = generateDocsHtml(project, 'test-repo');
        expect(html).toContain('<div class="module-name">module1');
    });
});

describe('generateMockData', () => {
    it('should return a string for type "string"', () => {
        expect(generateMockData('string')).toBe('mock string');
    });

    it('should return a number for type "number"', () => {
        expect(generateMockData('number')).toBe(123);
    });

    it('should return a boolean for type "boolean"', () => {
        expect(generateMockData('boolean')).toBe(true);
    });

    it('should return an object for other types', () => {
        expect(generateMockData('MyType')).toEqual({ message: 'mock object for type MyType' });
    });
});
