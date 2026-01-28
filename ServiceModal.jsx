import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Separator } from "./ui/separator";
import {
  CalendarIcon,
  Loader2,
  Plus,
  Trash2,
  User,
  Bell,
  Settings2,
  Info
} from "lucide-react";
import { format, parseISO, addMonths } from "date-fns";
import { cn } from "../lib/utils";

const OWNER_ROLES = [
  "App Owner",
  "Developer",
  "Manager",
  "Project Manager",
  "IT Admin",
  "Finance",
  "Other"
];

const DURATION_PRESETS = [
  { label: "1 Month", months: 1 },
  { label: "3 Months", months: 3 },
  { label: "6 Months", months: 6 },
  { label: "1 Year", months: 12 },
  { label: "2 Years", months: 24 },
  { label: "3 Years", months: 36 },
];


// Helper for generating IDs safely in insecure contexts (HTTP)
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
};

// Fallback if crypto.getRandomValues is also missing (very old browsers or weird contexts)
const safeUUID = () => {
  try {
    return generateUUID();
  } catch (e) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

const ServiceModal = ({ open, onClose, onSubmit, service, categories }) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [formData, setFormData] = useState({
    name: "",
    provider: "",
    category_id: "",
    category_name: "Uncategorized",
    expiry_date: "",
    expiry_duration_months: null,
    use_duration: false,
    reminder_thresholds: [
      { id: safeUUID(), days_before: 30, label: "First reminder" },
      { id: safeUUID(), days_before: 7, label: "Second reminder" },
      { id: safeUUID(), days_before: 1, label: "Final reminder" }
    ],
    owners: [],
    notes: "",
    cost: "",
    software: "",
    environment: "",
    unit: "",
    quantity: "",
    license_type: "",
    utilized_quantity: ""
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || "",
        provider: service.provider || "",
        category_id: service.category_id || "",
        category_name: service.category_name || "Uncategorized",
        expiry_date: service.expiry_date || "",
        expiry_duration_months: service.expiry_duration_months || null,
        use_duration: !!service.expiry_duration_months,
        reminder_thresholds: service.reminder_thresholds?.length > 0
          ? service.reminder_thresholds
          : [
            { id: safeUUID(), days_before: 30, label: "First reminder" },
            { id: safeUUID(), days_before: 7, label: "Second reminder" },
            { id: safeUUID(), days_before: 1, label: "Final reminder" }
          ],
        owners: service.owners || [],
        notes: service.notes || "",
        cost: service.cost?.toString() || "",
        software: service.software || "",
        environment: service.environment || "",
        unit: service.unit || "",
        quantity: service.quantity?.toString() || "",
        license_type: service.license_type || "",
        utilized_quantity: service.utilized_quantity?.toString() || ""
      });
      if (service.expiry_date) {
        setSelectedDate(parseISO(service.expiry_date));
      }
    } else {
      setFormData({
        name: "",
        provider: "",
        category_id: "",
        category_name: "Uncategorized",
        expiry_date: "",
        expiry_duration_months: null,
        use_duration: false,
        reminder_thresholds: [
          { id: safeUUID(), days_before: 30, label: "First reminder" },
          { id: safeUUID(), days_before: 7, label: "Second reminder" },
          { id: safeUUID(), days_before: 1, label: "Final reminder" }
        ],
        owners: [],
        notes: "",
        cost: "",
        software: "",
        environment: "",
        unit: "",
        quantity: "",
        license_type: "",
        utilized_quantity: ""
      });
      setSelectedDate(null);
    }
    setActiveTab("basic");
  }, [service, open]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    if (date) {
      setFormData({ ...formData, expiry_date: date.toISOString(), use_duration: false });
    }
    setCalendarOpen(false);
  };

  const handleDurationSelect = (months) => {
    const expiryDate = addMonths(new Date(), months);
    setSelectedDate(expiryDate);
    setFormData({
      ...formData,
      expiry_duration_months: months,
      expiry_date: expiryDate.toISOString(),
      use_duration: true
    });
  };

  const handleCategoryChange = (categoryId) => {
    const category = categories?.find(c => c.id === categoryId);
    setFormData({
      ...formData,
      category_id: categoryId,
      category_name: category?.name || "Uncategorized"
    });
  };

  // Reminder threshold handlers
  const addThreshold = () => {
    setFormData({
      ...formData,
      reminder_thresholds: [
        ...formData.reminder_thresholds,
        { id: safeUUID(), days_before: 14, label: `Reminder ${formData.reminder_thresholds.length + 1}` }
      ]
    });
  };

  const removeThreshold = (id) => {
    if (formData.reminder_thresholds.length > 1) {
      setFormData({
        ...formData,
        reminder_thresholds: formData.reminder_thresholds.filter(t => t.id !== id)
      });
    }
  };

  const updateThreshold = (id, field, value) => {
    setFormData({
      ...formData,
      reminder_thresholds: formData.reminder_thresholds.map(t =>
        t.id === id ? { ...t, [field]: field === "days_before" ? parseInt(value) || 0 : value } : t
      )
    });
  };

  // Owner handlers
  const addOwner = () => {
    setFormData({
      ...formData,
      owners: [
        ...formData.owners,
        { id: safeUUID(), name: "", email: "", role: "App Owner" }
      ]
    });
  };

  const removeOwner = (id) => {
    setFormData({
      ...formData,
      owners: formData.owners.filter(o => o.id !== id)
    });
  };

  const updateOwner = (id, field, value) => {
    setFormData({
      ...formData,
      owners: formData.owners.map(o =>
        o.id === id ? { ...o, [field]: value } : o
      )
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        name: formData.name,
        provider: formData.provider,
        category_id: formData.category_id || null,
        category_name: formData.category_name,
        expiry_date: formData.expiry_date,
        expiry_duration_months: formData.use_duration ? formData.expiry_duration_months : null,
        reminder_thresholds: formData.reminder_thresholds,
        owners: formData.owners.filter(o => o.name && o.email),
        notes: formData.notes,
        cost: parseFloat(formData.cost) || 0,
        software: formData.software,
        environment: formData.environment,
        unit: formData.unit,
        quantity: parseInt(formData.quantity) || 0,
        license_type: formData.license_type,
        utilized_quantity: parseInt(formData.utilized_quantity) || 0
      });
    } finally {
      setLoading(false);
    }
  };

  const isValid = formData.name && formData.provider && formData.expiry_date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? "Edit Service" : "Add New Service"}</DialogTitle>
          <DialogDescription>
            {service
              ? "Update the service details, expiry settings, and stakeholders."
              : "Fill in the details to add a new service for tracking."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="basic" data-testid="tab-basic">
                <Info className="h-4 w-4 mr-2" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="expiry" data-testid="tab-expiry">
                <Bell className="h-4 w-4 mr-2" />
                Expiry & Reminders
              </TabsTrigger>
              <TabsTrigger value="owners" data-testid="tab-owners">
                <User className="h-4 w-4 mr-2" />
                Owners
              </TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="label-uppercase">Service Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Adobe Creative Cloud"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="service-name-input"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider" className="label-uppercase">Provider *</Label>
                  <Input
                    id="provider"
                    placeholder="e.g., Adobe Inc."
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    required
                    data-testid="service-provider-input"
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="label-uppercase">Category</Label>
                  <Select
                    value={formData.category_id || "uncategorized"}
                    onValueChange={(value) => handleCategoryChange(value === "uncategorized" ? "" : value)}
                  >
                    <SelectTrigger data-testid="service-category-select" className="bg-background">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uncategorized">Uncategorized</SelectItem>
                      {categories?.sort((a, b) => (a.parent_id || "").localeCompare(b.parent_id || "") || a.name.localeCompare(b.name)).map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            {cat.parent_id && <span className="text-muted-foreground">↳</span>}
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost" className="label-uppercase">Annual Cost ($)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    data-testid="service-cost-input"
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="software" className="label-uppercase">Software</Label>
                  <Input
                    id="software"
                    placeholder="e.g., Photoshop"
                    value={formData.software}
                    onChange={(e) => setFormData({ ...formData, software: e.target.value })}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="environment" className="label-uppercase">Environment</Label>
                  <Select
                    value={formData.environment}
                    onValueChange={(value) => setFormData({ ...formData, environment: value })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select Environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="On-Premises">On-Premises</SelectItem>
                      <SelectItem value="Cloud">Cloud</SelectItem>
                      <SelectItem value="On-Premises and Cloud">On-Premises and Cloud</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license_type" className="label-uppercase">License Type</Label>
                  <Input
                    id="license_type"
                    placeholder="e.g., Per User"
                    value={formData.license_type}
                    onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit" className="label-uppercase">Unit</Label>
                  <Input
                    id="unit"
                    placeholder="e.g., Seat"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity" className="label-uppercase">Number of Licenses</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="utilized_quantity" className="label-uppercase">Utilized Licenses</Label>
                  <Input
                    id="utilized_quantity"
                    type="number"
                    placeholder="0"
                    value={formData.utilized_quantity}
                    onChange={(e) => setFormData({ ...formData, utilized_quantity: e.target.value })}
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="label-uppercase">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional notes about this service..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  data-testid="service-notes-input"
                  className="bg-background resize-none"
                />
              </div>
            </TabsContent>

            {/* Expiry & Reminders Tab */}
            <TabsContent value="expiry" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  Expiry Date Settings
                </h4>

                {/* Toggle between fixed date and duration */}
                <div className="flex items-center gap-4 p-3 rounded-sm bg-muted/30 border border-border">
                  <span className={cn("text-sm", !formData.use_duration && "text-primary font-medium")}>Fixed Date</span>
                  <Switch
                    checked={formData.use_duration}
                    onCheckedChange={(checked) => setFormData({ ...formData, use_duration: checked })}
                  />
                  <span className={cn("text-sm", formData.use_duration && "text-primary font-medium")}>Duration from Today</span>
                </div>

                {!formData.use_duration ? (
                  <div className="space-y-2">
                    <Label className="label-uppercase">Expiry Date *</Label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal bg-background",
                            !selectedDate && "text-muted-foreground"
                          )}
                          data-testid="service-expiry-date-btn"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="label-uppercase">Duration from Today</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {DURATION_PRESETS.map(preset => (
                        <Button
                          key={preset.months}
                          type="button"
                          variant={formData.expiry_duration_months === preset.months ? "default" : "outline"}
                          className="w-full"
                          onClick={() => handleDurationSelect(preset.months)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    {selectedDate && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Expires on: <span className="text-foreground font-medium">{format(selectedDate, "MMM d, yyyy")}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Reminder Thresholds
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addThreshold}
                    data-testid="add-threshold-btn"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Reminder
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground">
                  Configure when you want to receive reminder notifications before this service expires.
                </p>

                <div className="space-y-3">
                  {formData.reminder_thresholds.map((threshold, index) => (
                    <div
                      key={threshold.id}
                      className="flex items-center gap-3 p-3 rounded-sm bg-muted/30 border border-border"
                    >
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Days Before Expiry</Label>
                          <Input
                            type="number"
                            min="1"
                            max="365"
                            value={threshold.days_before}
                            onChange={(e) => updateThreshold(threshold.id, "days_before", e.target.value)}
                            className="bg-background h-9"
                            data-testid={`threshold-days-${index}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Label</Label>
                          <Input
                            value={threshold.label}
                            onChange={(e) => updateThreshold(threshold.id, "label", e.target.value)}
                            placeholder="e.g., First reminder"
                            className="bg-background h-9"
                            data-testid={`threshold-label-${index}`}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeThreshold(threshold.id)}
                        disabled={formData.reminder_thresholds.length <= 1}
                        data-testid={`remove-threshold-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Owners Tab */}
            <TabsContent value="owners" className="space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Service Owners / Stakeholders
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add people who should be notified about this service's expiry.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOwner}
                  data-testid="add-owner-btn"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Owner
                </Button>
              </div>

              {formData.owners.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-sm">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No owners added yet. Click "Add Owner" to add stakeholders.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.owners.map((owner, index) => (
                    <div
                      key={owner.id}
                      className="p-4 rounded-sm bg-muted/30 border border-border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Owner #{index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeOwner(owner.id)}
                          data-testid={`remove-owner-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Full Name *</Label>
                          <Input
                            value={owner.name}
                            onChange={(e) => updateOwner(owner.id, "name", e.target.value)}
                            placeholder="John Doe"
                            className="bg-background h-9"
                            data-testid={`owner-name-${index}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Email Address *</Label>
                          <Input
                            type="email"
                            value={owner.email}
                            onChange={(e) => updateOwner(owner.id, "email", e.target.value)}
                            placeholder="john@company.com"
                            className="bg-background h-9"
                            data-testid={`owner-email-${index}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Role</Label>
                          <Input
                            list={`roles-list-${owner.id}`}
                            value={owner.role}
                            onChange={(e) => updateOwner(owner.id, "role", e.target.value)}
                            placeholder="App Owner"
                            className="bg-background h-9"
                            data-testid={`owner-role-${index}`}
                          />
                          <datalist id={`roles-list-${owner.id}`}>
                            {OWNER_ROLES.map(role => (
                              <option key={role} value={role} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0 mt-6 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="cancel-service-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !isValid}
              className="btn-primary"
              data-testid="submit-service-btn"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                service ? "Update Service" : "Add Service"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
