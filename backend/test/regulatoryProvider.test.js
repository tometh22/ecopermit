const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseWfsFeatureTypeNames,
  chooseTypeName,
  chooseTypeNames,
} = require("../src/v2/providers/regulatoryProvider");

test("Parses WFS type names from capabilities", () => {
  const xml = `
    <WFS_Capabilities>
      <FeatureTypeList>
        <FeatureType><Name>ign:area_hidrografia_a</Name></FeatureType>
        <FeatureType><wfs:Name>ign:linea_hidrografia_l</wfs:Name></FeatureType>
      </FeatureTypeList>
    </WFS_Capabilities>
  `;
  const names = parseWfsFeatureTypeNames(xml);
  assert.deepEqual(names, ["ign:area_hidrografia_a", "ign:linea_hidrografia_l"]);
});

test("Chooses typeName using hints", () => {
  const selected = chooseTypeName({
    source: {
      typeNameHints: ["linea_hidrografia"],
    },
    availableTypeNames: ["ign:area_hidrografia_a", "ign:linea_hidrografia_l"],
  });

  assert.equal(selected, "ign:linea_hidrografia_l");
});

test("Builds candidate typeName list with hints and hydric fallback", () => {
  const selected = chooseTypeNames({
    source: {
      name: "IGN - Hidrografía lineal",
      type: "Red hídrica",
      typeNameHints: ["lineas_de_aguas_continentales_perenne"],
    },
    availableTypeNames: [
      "ign:lineas_de_aguas_continentales_perenne",
      "ign:lineas_de_aguas_continentales_intermitentes",
      "ign:area_protegida",
    ],
  });

  assert.equal(selected[0], "ign:lineas_de_aguas_continentales_perenne");
  assert.ok(selected.includes("ign:lineas_de_aguas_continentales_intermitentes"));
});
