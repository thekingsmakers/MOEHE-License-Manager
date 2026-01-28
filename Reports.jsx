import { useState, useMemo } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Download, FileText, FileSpreadsheet, FileJson } from "lucide-react";
import { API } from "../App";
import { useAuth } from "../App";
import { toast } from "sonner";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from "recharts";

const Reports = ({ services = [] }) => {
    const { token } = useAuth();
    const [exportFormat, setExportFormat] = useState("pdf");
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const response = await fetch(`${API}/reports/export?format=${exportFormat}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) throw new Error("Export failed");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;

            const ext = exportFormat === "excel" ? "xlsx" : exportFormat;
            a.download = `services_report.${ext}`;

            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Report downloaded successfully");
        } catch (error) {
            console.error(error);
            toast.error("Failed to download report");
        } finally {
            setDownloading(false);
        }
    };

    // Prepare chart data
    const categoryData = useMemo(() => {
        const data = {};
        services.forEach(s => {
            const cat = s.category_name || "Uncategorized";
            if (!data[cat]) data[cat] = { name: cat, value: 0, cost: 0 };
            data[cat].value += 1;
            data[cat].cost += parseFloat(s.cost || 0);
        });
        return Object.values(data);
    }, [services]);

    const expiryData = useMemo(() => {
        const months = {};
        const now = new Date();
        services.forEach(s => {
            if (!s.expiry_date) return;
            const date = new Date(s.expiry_date);
            if (date < now) return; // Skip expired

            const key = date.toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!months[key]) months[key] = { name: key, count: 0, date: date };
            months[key].count += 1;
        });
        return Object.values(months).sort((a, b) => a.date - b.date).slice(0, 6); // Next 6 months
    }, [services]);

    const environmentData = useMemo(() => {
        const data = {};
        services.forEach(s => {
            const env = s.environment || "Unknown";
            if (!data[env]) data[env] = { name: env, value: 0 };
            data[env].value += 1;
        });
        return Object.values(data);
    }, [services]);

    const utilizationData = useMemo(() => {
        return services
            .map(s => ({
                name: s.name,
                purchased: parseInt(s.quantity || 0),
                utilized: parseInt(s.utilized_quantity || 0)
            }))
            .sort((a, b) => b.purchased - a.purchased)
            .slice(0, 10);
    }, [services]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

    return (
        <div className="animate-enter space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
                <p className="text-muted-foreground mt-1">
                    Generate detailed reports and visualize your service portfolio.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Export Card */}
                <Card className="col-span-full">
                    <CardHeader>
                        <CardTitle>Export Data</CardTitle>
                        <CardDescription>Download a comprehensive report in your preferred format including all license details.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row items-end gap-4">
                        <div className="grid w-full max-w-xs items-center gap-1.5">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Format
                            </label>
                            <Select value={exportFormat} onValueChange={setExportFormat}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pdf">
                                        <div className="flex items-center">
                                            <FileText className="mr-2 h-4 w-4" /> PDF
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="excel">
                                        <div className="flex items-center">
                                            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="csv">
                                        <div className="flex items-center">
                                            <FileJson className="mr-2 h-4 w-4" /> CSV
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleDownload} disabled={downloading} className="btn-primary min-w-[120px]">
                            {downloading ? "Generating..." : (
                                <>
                                    <Download className="mr-2 h-4 w-4" /> Download
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Services by Environment (Pie) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Services by Environment</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={environmentData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {environmentData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Services by Category (Pie) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Services by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Cost Distribution (Bar) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Cost by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] p-0">
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryData}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} hide />
                                    <YAxis tickFormatter={(value) => `$${value}`} fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        formatter={(value) => [`$${value}`, "Cost"]}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                    />
                                    <Bar dataKey="cost" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                    <Legend />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* License Utilization (Bar - Top 10) */}
                <Card className="col-span-full lg:col-span-2">
                    <CardHeader>
                        <CardTitle>License Utilization (Top 10)</CardTitle>
                        <CardDescription>Comparison of Purchased vs Utilized Licenses</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={utilizationData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                />
                                <Legend />
                                <Bar dataKey="purchased" name="Purchased" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="utilized" name="Utilized" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Upcoming Expiry Chart */}
                <Card className="col-span-full lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Upcoming Expiries</CardTitle>
                        <CardDescription>Services expiring in next 6 months</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={expiryData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                />
                                <Bar dataKey="count" name="Expiring Services" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Reports;
