import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { MoreVertical, Pencil, Trash2, Mail, Calendar, Building2 } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";

const ServiceTable = ({
  services,
  loading,
  onEdit,
  onDelete,
  onSendReminder,
  getServiceStatus
}) => {
  const [deleteDialog, setDeleteDialog] = useState({ open: false, service: null });

  const confirmDelete = () => {
    if (deleteDialog.service) {
      onDelete(deleteDialog.service.id);
      setDeleteDialog({ open: false, service: null });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      safe: "status-badge status-safe",
      warning: "status-badge status-warning",
      danger: "status-badge status-danger",
      expired: "status-badge status-expired"
    };

    const labels = {
      safe: "Safe",
      warning: "Expiring Soon",
      danger: "Critical",
      expired: "Expired"
    };

    return (
      <span className={styles[status]} data-testid={`status-badge-${status}`}>
        {labels[status]}
      </span>
    );
  };

  const getDaysUntil = (expiryDate) => {
    const days = differenceInDays(parseISO(expiryDate), new Date());
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return `${days}d`;
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (services.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No services found</h3>
          <p className="text-muted-foreground text-sm">
            Add your first service to start tracking renewals
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border-border" data-testid="service-table-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">
            All Services
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({services.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="table-header">Service</TableHead>
                  <TableHead className="table-header">Software</TableHead>
                  <TableHead className="table-header">Environment</TableHead>
                  <TableHead className="table-header">Provider</TableHead>
                  <TableHead className="table-header">Category</TableHead>
                  <TableHead className="table-header">Unit</TableHead>
                  <TableHead className="table-header">Licenses</TableHead>
                  <TableHead className="table-header">Expiry Date</TableHead>
                  <TableHead className="table-header">Countdown</TableHead>
                  <TableHead className="table-header">Status</TableHead>
                  <TableHead className="table-header">Cost</TableHead>
                  <TableHead className="table-header text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => {
                  const status = getServiceStatus(service.expiry_date);
                  return (
                    <TableRow
                      key={service.id}
                      className="border-border hover:bg-white/5 transition-colors"
                      data-testid={`service-row-${service.id}`}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <p className="font-semibold">{service.name}</p>
                          <p className="text-xs text-muted-foreground">{service.contact_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.software || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-xs">
                          {service.environment || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.provider}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {service.category_name || service.category || "Uncategorized"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-xs border-dashed">
                          {service.unit || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-sm">
                          <span className="font-medium text-foreground">{service.quantity || 0}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-foreground">{service.utilized_quantity || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(parseISO(service.expiry_date), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm font-medium ${status === "expired" ? "text-zinc-400" :
                          status === "danger" ? "text-red-500" :
                            status === "warning" ? "text-amber-500" :
                              "text-emerald-500"
                          }`}>
                          {getDaysUntil(service.expiry_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(status)}
                      </TableCell>
                      <TableCell className="font-mono">
                        ${service.cost?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`service-actions-${service.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => onEdit(service)}
                              data-testid={`edit-service-${service.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onSendReminder(service)}
                              data-testid={`send-reminder-${service.id}`}
                            >
                              <Mail className="h-4 w-4 mr-2" />
                              Send Reminder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteDialog({ open: true, service })}
                              className="text-destructive focus:text-destructive"
                              data-testid={`delete-service-${service.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, service: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDialog.service?.name}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ServiceTable;
