import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Download, Copy, Users, Sparkles } from 'lucide-react';
import { TraceDataViewer } from '@/components/TraceDataViewer';

// Sample trace data that matches your database structure
const sampleTraces = [
  {
    id: "trace-1",
    input: '{"question": "How many unique contacts were delivered an email that contains \'nurture\' in FY26, grouped by month"}',
    output: '{"result": [{"calendar_year_month": "2025-02", "unique_contacts_delivered_nurture_email": "28224"}, {"calendar_year_month": "2025-03", "unique_contacts_delivered_nurture_email": "21312"}, {"calendar_year_month": "2025-04", "unique_contacts_delivered_nurture_email": "60221"}, {"calendar_year_month": "2025-05", "unique_contacts_delivered_nurture_email": "41836"}, {"calendar_year_month": "2025-06", "unique_contacts_delivered_nurture_email": "49578"}, {"calendar_year_month": "2025-07", "unique_contacts_delivered_nurture_email": "104545"}, {"calendar_year_month": "2025-08", "unique_contacts_delivered_nurture_email": "92252"}, {"calendar_year_month": "2025-09", "unique_contacts_delivered_nurture_email": "8870"}], "query_text": "SELECT \\n calendar_year_month, \\n COUNT(DISTINCT audience_id) AS unique_contacts_delivered_nurture_email\\nFROM \\n main.marketing_lakehouse_silver.gs_engagements\\nWHERE \\n fiscal_year = 2026\\n AND engagement_type = \'Email Deliver\'\\n AND is_nurture_email_engagement = TRUE\\nGROUP BY \\n calendar_year_month\\nORDER BY \\n calendar_year_month ASC"}',
    mlflow_trace_id: "mlflow-12345"
  },
  {
    id: "trace-2",
    input: '{"question": "What is the audience persona of Chief Digital Officer as job title?"}',
    output: '{"result": [{"audience_persona": "Business Execs"}, {"audience_persona": "Data Engineer"}, {"audience_persona": "CDO"}, {"audience_persona": "CMO"}, {"audience_persona": "CTO"}, {"audience_persona": "Data Architect"}, {"audience_persona": "Unprioritized"}, {"audience_persona": "CIO"}], "query_text": "SELECT DISTINCT `gs_contacts`.`audience_persona`\\nFROM `main`.`marketing_lakehouse_silver`.`gs_contacts`\\nWHERE `gs_contacts`.`job_title_english` ILIKE \'%Chief Digital Officer%\'\\n  AND `gs_contacts`.`audience_persona` IS NOT NULL"}',
    mlflow_trace_id: "mlflow-67890"
  },
  {
    id: "trace-3",
    input: '{"question": "What are the top 20 salesforce campaigns for the audience_persona Data Analysts by U2 generation in FY26 H1?"}',
    output: '{"result": [{"engagement_sfdc_campaign_name": "FY240626-Ondemandtraining-GLOB-GenerativeAIFundamentals", "total_u2_units": "1.0775893023237586"}, {"engagement_sfdc_campaign_name": "FY261101-EV-Data+AISummit-2025", "total_u2_units": "0.7277024984359741"}, {"engagement_sfdc_campaign_name": "FY260513-IF-Energy-ExecRT-Sydney", "total_u2_units": "0.5238495022058487"}], "query_text": "WITH filtered_attribution AS (\\n  SELECT a.engagement_id, a.audience_id, a.u2_unit\\n  FROM main.marketing_lakehouse_silver.gs_attribution a\\n  WHERE a.fiscal_year = 2026\\n    AND a.fiscal_month_relative BETWEEN 0 AND 5\\n    AND a.u2_unit > 0\\n),\\njoined_data AS (\\n  SELECT fa.engagement_id, fa.audience_id, fa.u2_unit, e.engagement_sfdc_campaign_name, c.audience_persona\\n  FROM filtered_attribution fa\\n  JOIN main.marketing_lakehouse_silver.gs_engagements e ON fa.engagement_id = e.engagement_id\\n  JOIN main.marketing_lakehouse_silver.gs_contacts c ON fa.audience_id = c.audience_id\\n  WHERE c.audience_persona = \'Data Analyst\'\\n    AND e.engagement_sfdc_campaign_name IS NOT NULL\\n)\\nSELECT \\n  engagement_sfdc_campaign_name,\\n  SUM(u2_unit) AS total_u2_units\\nFROM joined_data\\nGROUP BY engagement_sfdc_campaign_name\\nORDER BY total_u2_units DESC\\nLIMIT 20"}',
    mlflow_trace_id: "mlflow-11111"
  }
];

export function TraceDataViewerDemo() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Trace Data Viewer Demo
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This demo shows how trace data with JSON results can be displayed as formatted tables, 
            with SQL queries properly formatted and downloadable. Perfect for workshop participants 
            to analyze trace outputs.
          </p>
        </div>

        {/* Features Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="text-center p-4 border-l-4 border-blue-500">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <BarChart className="h-8 w-8 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Data Tables</h3>
                  </div>
                  <p className="text-sm text-blue-700">
                    Convert JSON results into readable tables with proper headers
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center p-4 border-l-4 border-green-500">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Download className="h-8 w-8 text-green-600" />
                    <h3 className="font-semibold text-green-900">Export Options</h3>
                  </div>
                  <p className="text-sm text-green-700">
                    Download data as CSV and SQL queries as .sql files
                  </p>
                </CardContent>
              </Card>
              <Card className="text-center p-4 border-l-4 border-purple-500">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Copy className="h-8 w-8 text-purple-600" />
                    <h3 className="font-semibold text-purple-900">Copy & Paste</h3>
                  </div>
                  <p className="text-sm text-purple-700">
                    Easy copying of data, queries, and JSON for further analysis
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Sample Traces */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Sample Trace Data</h2>
          
          {sampleTraces.map((trace, index) => (
            <div key={trace.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Trace {trace.id}
                </h3>
                {trace.mlflow_trace_id && (
                  <span className="text-sm text-gray-500">
                    MLflow: {trace.mlflow_trace_id}
                  </span>
                )}
              </div>
              
              <TraceDataViewer 
                trace={trace} 
                showContext={true}
                className="shadow-sm"
              />
            </div>
          ))}
        </div>

        {/* Usage Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-l-4 border-blue-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="h-6 w-6 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">For Workshop Participants</h3>
                  </div>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>View trace results in organized tables</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>Copy data for further analysis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>Download results as CSV files</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>Examine SQL queries for learning</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-purple-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-6 w-6 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">For Facilitators</h3>
                  </div>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>Review trace outputs easily</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>Export data for external analysis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>Share SQL queries with participants</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>Monitor trace quality and structure</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Integration Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              This component can be integrated into your existing workshop pages to display trace data 
              in a user-friendly format. It automatically detects JSON structure and creates appropriate 
              tables and SQL formatting.
            </p>
            <div className="bg-gray-50 p-3 rounded border">
              <code className="text-sm text-gray-800">
                {`import { TraceDataViewer } from '@/components/TraceDataViewer';

<TraceDataViewer 
  trace={traceData} 
  showContext={true}
  className="your-custom-classes"
/>`}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
