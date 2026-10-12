import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { documentFont } from "./documentFont";

/** The attached UTF-8 source preserves text beyond the font's glyph coverage. */
export async function renderDocument(
  kind: string,
  name: string,
  lines: string[],
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    Uint8Array.from(atob(documentFont), (c) => c.charCodeAt(0)),
    { subset: true },
  );
  pdf.setTitle(`Grounded ${kind.replaceAll("_", " ")}`);
  const source = [
    `GROUNDED | ${kind.replaceAll("_", " ").toUpperCase()}`,
    name,
    `Generated ${new Date().toISOString()}`,
    ...lines,
  ];
  await pdf.attach(
    new TextEncoder().encode(source.join("\n")),
    "complete-record.txt",
    { mimeType: "text/plain", description: "Complete UTF-8 document content" },
  );
  let page = pdf.addPage(),
    y = 785;
  const widths=new Map<string,number>();
  const width=(character:string)=>{let n=widths.get(character);if(n===undefined){n=font.widthOfTextAtSize(character,10);widths.set(character,n);}return n;};
  const row = (text: string) => {
    if (y < 55) {
      page = pdf.addPage();
      y = 785;
    }
    page.drawText(text, {
      x: 48,
      y,
      size: 10,
      font,
      color: rgb(0.12, 0.24, 0.17),
    });
    y -= 16;
  };
  for (const paragraph of source) {
    for (const line of String(paragraph).split(/\r?\n/)) {
      let buffer = "";
      let rowWidth=0;
      // Wrap even long identifiers and unbroken words within the page width.
      for (const character of line.replace(/\t/g, "    ")) {
        if (rowWidth+width(character) > 495) {
          row(buffer);
          buffer = "";
          rowWidth=0;
        }
        buffer += character;
        rowWidth+=width(character);
      }
      row(buffer);
    }
    y -= 6;
  }
  return pdf.save();
}
