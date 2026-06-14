import { OntologyTool } from "./_components/OntologyTool";
import {
  getContentCoverage,
  getSourceDistribution,
  loadOntologyAbout,
  loadOntologySchema,
} from "@/lib/dev/parse-ontology";

/** Dev-only ontology visualization page. */
export default function OntologyDevPage() {
  const schema = loadOntologySchema();
  const coverage = getContentCoverage(schema);
  const sourceDistribution = getSourceDistribution(schema);
  const aboutMarkdown = loadOntologyAbout();

  return (
    <OntologyTool
      schema={schema}
      coverage={coverage}
      sourceDistribution={sourceDistribution}
      aboutMarkdown={aboutMarkdown}
    />
  );
}
