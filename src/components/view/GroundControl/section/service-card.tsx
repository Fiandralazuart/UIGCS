import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type ServiceColor = "blue" | "purple" | "yellow" | "cyan" | "gray";

export interface ServiceCardProps {
  title: string;
  badge: string;
  status: string;
  icon: React.ElementType;
  color: ServiceColor;
  details: { label: string; value: string }[];
  footer: string;
  action: string;
}

const colorMap: Record<ServiceColor, string> = {
  blue: "bg-blue-50 text-blue-500 border-blue-100",
  purple: "bg-purple-50 text-purple-500 border-purple-100",
  yellow: "bg-yellow-50 text-yellow-600 border-yellow-100",
  cyan: "bg-cyan-50 text-cyan-500 border-cyan-100",
  gray: "bg-slate-50 text-slate-400 border-slate-200",
};

export function ServiceCard({
  title,
  badge,
  status,
  icon: Icon,
  color,
  details,
  footer,
  action,
}: ServiceCardProps) {
  return (
    <Card className="h-full overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-md border ${colorMap[color]}`}
          >
            <Icon size={13} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-[12px] font-black tracking-wide text-slate-700">
                {title}
              </CardTitle>
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[8px] font-bold text-slate-400"
              >
                {badge}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              {status}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-2.5">
        <div className="space-y-2">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-[9px] text-slate-400">{detail.label}</span>
              <span className="truncate font-mono text-[9px] font-bold text-slate-500">
                {detail.value}
              </span>
            </div>
          ))}
        </div>
        <Separator className="my-2 bg-slate-100" />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] text-slate-400">{footer}</span>
          <Button
            disabled
            size="sm"
            className="h-7 px-2.5 text-[8px] font-bold"
          >
            <span className="mr-1">▶</span>
            {action}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
