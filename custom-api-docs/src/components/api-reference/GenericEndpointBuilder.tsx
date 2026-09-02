"use client";

import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSample } from "./CodeSample";
import { ApiTester } from "./ApiTester";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Controller } from "react-hook-form";

export interface QueryParam {
  name: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface GenericEndpointBuilderProps {
  method: string;
  path: string;
  queryParams?: QueryParam[];
}

export function GenericEndpointBuilder({ method, path, queryParams = [] }: GenericEndpointBuilderProps) {
  const { register, watch, control } = useForm();
  const formValues = watch();

  // Construct the query string
  const queryParts = [];
  for (const param of queryParams) {
    if (formValues[param.name]) {
      queryParts.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(formValues[param.name])}`);
    }
  }
  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const fullPath = `${path}${queryString}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Visual Builder */}
      <div className="space-y-6">
        {queryParams.length > 0 ? (
          <div>
            <h2 className="text-lg font-semibold mb-4">Query Parameters</h2>
            <Card>
              <CardContent className="pt-6 space-y-6">
                {queryParams.map(param => (
                  <div key={param.name} className="space-y-2">
                    <Label className="text-sm font-medium">
                      {param.name} {param.required && <span className="text-destructive">*</span>}
                    </Label>
                    {param.options ? (
                      <Controller
                        control={control}
                        name={param.name}
                        render={({ field }) => (
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder={param.placeholder || `Select ${param.name}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {param.options?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    ) : (
                      <Input 
                        placeholder={param.placeholder || `Enter ${param.name}...`} 
                        {...register(param.name)} 
                      />
                    )}
                    {param.description && (
                      <p className="text-xs text-muted-foreground">{param.description}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">This endpoint does not require any parameters. Just authenticate and send the request.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Right Column: Code & Testing */}
      <div className="space-y-6 sticky top-20">
        <div>
          <h2 className="text-lg font-semibold mb-4">Code Snippets</h2>
          <CodeSample method={method} path={fullPath} />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Test Request</h2>
          <ApiTester method={method} path={fullPath} />
        </div>
      </div>
    </div>
  );
}
