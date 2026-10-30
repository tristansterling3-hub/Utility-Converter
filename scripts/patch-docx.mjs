// Compatibility fixes for pinned docx-preview 0.4.1 (Apache-2.0).
// Reproduce fixes during build; never edit node_modules in place.
export function patchDocxRenderer(source) {
  function replaceOnce(before, after) {
    if (source.split(before).length !== 2) throw new Error('docx-preview changed; review the layout patch before upgrading.');
    source = source.replace(before, after);
  }
  // Word stores explicit line breaks as w:br/w:cr. XML newlines inside w:t
  // are whitespace; treating them as CSS pre-wrap breaks fragments resumes.
  replaceOnce('type: DomType.Text,\n                            text: c.textContent',
    'type: DomType.Text,\n                            text: c.textContent.replace(/[\\r\\n\\t]+/g, " ")');
  replaceOnce('if (elem.localName == "pPr")\n                            this.parseSpacing(c, style);',
    'if (elem.localName == "pPr")\n                            this.parseSpacing(c, style);\n                        else if (elem.localName == "rPr")\n                            style["letter-spacing"] = globalXmlParser.lengthAttr(c, "val");');
  // Word's automatic spacing multiplies the font's natural line height,
  // whereas a CSS number multiplies only its em size.
  replaceOnce('style["line-height"] = `${(line / 240).toFixed(2)}`;',
    'style["line-height"] = "normal";\n                        style["--docx-line-multiple"] = `${line / 240}`;');
  replaceOnce('Object.assign(result.style, style);',
    'Object.assign(result.style, style);\n                for (const [key, value] of Object.entries(style)) {\n                    if (key.startsWith("--")) result.style.setProperty(key, value);\n                }');
  replaceOnce('            this.refreshTabStops();', '            // Measure tabs after insertion, fonts, and paragraph layout.');
  replaceOnce('        const nodes = await renderDocument(doc, userOptions);',
    '        const renderer = new HtmlRenderer();\n        const nodes = await renderer.render(doc, { ...defaultOptions, ...userOptions });');
  replaceOnce('            c.appendChild(n);\n        }\n        return doc;',
    `            c.appendChild(n);
        }
        bodyContainer.getBoundingClientRect();
        await bodyContainer.ownerDocument.fonts?.ready;
        await userOptions?.afterRender?.(bodyContainer, doc);
        bodyContainer.getBoundingClientRect();
        await bodyContainer.ownerDocument.fonts?.ready;
        renderer.refreshTabStops();
        return doc;`);
  replaceOnce(`            setTimeout(() => {
                const pixelToPoint = computePixelToPoint();
                for (let tab of this.currentTabs) {
                    updateTabStop(tab.span, tab.stops, this.defaultTabSize, pixelToPoint);
                }
            }, 500);`,
    `            for (let tab of this.currentTabs) {
                if (tab.span.isConnected)
                    updateTabStop(tab.span, tab.stops, this.defaultTabSize, 72 / 96);
            }`);
  replaceOnce('        const pcs = getComputedStyle(p);', '        const pcs = elem.ownerDocument.defaultView.getComputedStyle(p);');
  replaceOnce('            const range = document.createRange();', '            const range = elem.ownerDocument.createRange();');
  return source;
}
