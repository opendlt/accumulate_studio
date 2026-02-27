/**
 * Template Engine - Handlebars compilation, helpers, rendering
 *
 * Provides a configured Handlebars instance with custom helpers
 * for code generation across Python, Rust, and Dart.
 */

import Handlebars from 'handlebars';
import type { SDKLanguage, SDKMap, SDKOperation, FlowNode } from '@accumulate-studio/types';

import type { TemplateContext } from './manifest-generator';

// =============================================================================
// Case Conversion Utilities
// =============================================================================

export function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

export function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/-+/g, '-');
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// =============================================================================
// Template Engine
// =============================================================================

export interface TemplateEngine {
  renderPreamble(context: TemplateContext): string;
  renderEpilogue(context: TemplateContext): string;
  renderNode(opId: string, context: TemplateContext): string;
  renderFallback(blockType: string): string;
}

export function createTemplateEngine(
  language: SDKLanguage,
  templates: Record<string, string>,
): TemplateEngine {
  const hbs = Handlebars.create();

  // Register helpers
  hbs.registerHelper('snake_case', (val: string) => toSnakeCase(val));
  hbs.registerHelper('camelCase', (val: string) => toCamelCase(val));
  hbs.registerHelper('PascalCase', (val: string) => toPascalCase(val));
  hbs.registerHelper('kebabCase', (val: string) => toKebabCase(val));

  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  hbs.registerHelper('json', (obj: unknown) => JSON.stringify(obj));

  // Literal brace helpers - needed for Rust's json!() macro in templates
  // since {{ and }} are Handlebars delimiters
  hbs.registerHelper('lb', () => '{');
  hbs.registerHelper('rb', () => '}');

  hbs.registerHelper('repeatChar', (char: string, count: number) => {
    return char.repeat(count);
  });

  hbs.registerHelper('indent', (text: string, spaces: number) => {
    const indent = ' '.repeat(spaces);
    return text
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  });

  hbs.registerHelper('commentPrefix', () => {
    switch (language) {
      case 'python': return '#';
      case 'rust':
      case 'dart':
      case 'javascript':
      case 'typescript':
      case 'csharp':
        return '//';
      default: return '//';
    }
  });

  hbs.registerHelper('ifConfig', function (this: unknown, key: string, options: Handlebars.HelperOptions) {
    const ctx = this as Record<string, unknown>;
    const config = ctx.config as Record<string, unknown> | undefined;
    if (config && config[key] !== undefined && config[key] !== '' && config[key] !== null) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  // Compile templates
  const compiled = new Map<string, Handlebars.TemplateDelegate>();

  for (const [name, source] of Object.entries(templates)) {
    try {
      compiled.set(name, hbs.compile(source, { noEscape: true }));
    } catch (_e) {
      // Skip templates that fail to compile
    }
  }

  return {
    renderPreamble(context: TemplateContext): string {
      const tmpl = compiled.get('_preamble');
      if (!tmpl) return '';
      return tmpl(context);
    },

    renderEpilogue(context: TemplateContext): string {
      const tmpl = compiled.get('_epilogue');
      if (!tmpl) return '';
      return tmpl(context);
    },

    renderNode(opId: string, context: TemplateContext): string {
      const tmpl = compiled.get(opId);
      if (!tmpl) return this.renderFallback(context.node.type);
      return tmpl(context);
    },

    renderFallback(blockType: string): string {
      const tmpl = compiled.get('_fallback');
      if (!tmpl) return '';
      return tmpl({ blockType });
    },
  };
}

// =============================================================================
// Variable name helpers per language
// =============================================================================

export function nodeToVarName(node: FlowNode, language: SDKLanguage): string {
  const base = node.label || node.id || node.type;

  if (language === 'dart' || language === 'javascript' || language === 'typescript' || language === 'csharp') {
    // Dart, JavaScript, TypeScript, and C# use camelCase
    const snake = base
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return snake.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
  }

  // Python and Rust use snake_case
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function lookupOperation(manifest: SDKMap | null, opId: string): SDKOperation | undefined {
  if (!manifest) return undefined;
  return manifest.operations.find((op) => op.op === opId);
}
