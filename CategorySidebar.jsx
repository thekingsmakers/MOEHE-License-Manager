import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth, API, useTheme } from "../App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Label } from "./ui/label";
import { toast } from "sonner";
import {
  Shield,
  LayoutDashboard,
  Bell,
  LogOut,
  Menu,
  X,
  Settings,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Inbox,
  FileText,
  Loader2,
  BarChart
} from "lucide-react";

const CATEGORY_COLORS = [
  "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#3b82f6", "#84cc16"
];

const CategorySidebar = ({ onCategorySelect, selectedCategoryId, onRefresh, onCategoryUpdated }) => {
  const { user, logout, token } = useAuth();
  const { branding } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoriesWithServices, setCategoriesWithServices] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [categoryModal, setCategoryModal] = useState({ open: false, category: null });
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", color: "#06b6d4", parent_id: "" });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/categories/with-services`, { headers });
      const allCats = response.data.categories || [];
      setAllCategories(allCats);

      // Build tree structure

      // Build tree structure
      const catMap = {};
      const roots = [];

      // First pass: map all categories
      allCats.forEach(cat => {
        cat.children = [];
        catMap[cat.id] = cat;
      });

      // Second pass: link parents and children
      allCats.forEach(cat => {
        if (cat.parent_id && catMap[cat.parent_id]) {
          catMap[cat.parent_id].children.push(cat);
        } else {
          roots.push(cat);
        }
      });

      // Sort roots by name (optional, backend already sorts but good safety)
      roots.sort((a, b) => {
        if (a.id === 'uncategorized') return 1;
        if (b.id === 'uncategorized') return -1;
        return a.name.localeCompare(b.name);
      });

      setCategoriesWithServices(roots);
    } catch (error) {
      console.error("Failed to fetch categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCategories();
    }
  }, [token]);

  // Refresh when onRefresh is triggered
  useEffect(() => {
    if (onRefresh) {
      fetchCategories();
    }
  }, [onRefresh]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const openCreateCategory = () => {
    setCategoryForm({ name: "", description: "", color: "#06b6d4", parent_id: "" });
    setCategoryModal({ open: true, category: null });
  };

  const openEditCategory = (category) => {
    setCategoryForm({
      name: category.name,
      description: category.description || "",
      color: category.color || "#06b6d4",
      parent_id: category.parent_id || ""
    });
    setCategoryModal({ open: true, category });
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setSaving(true);
    try {
      if (categoryModal.category) {
        await axios.put(
          `${API}/categories/${categoryModal.category.id}`,
          categoryForm,
          { headers }
        );
        toast.success("Category updated");
      } else {
        const payload = { ...categoryForm };
        if (!payload.parent_id) delete payload.parent_id;
        await axios.post(`${API}/categories`, payload, { headers });
        toast.success("Category created");
      }
      setCategoryModal({ open: false, category: null });
      fetchCategories();
      onCategoryUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm("Delete this category? Services will be moved to Uncategorized.")) return;

    try {
      await axios.delete(`${API}/categories/${categoryId}`, { headers });
      toast.success("Category deleted");
      fetchCategories();
      onCategoryUpdated?.();
      if (selectedCategoryId === categoryId) {
        onCategorySelect?.(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete category");
    }
  };

  const isAdmin = user?.role === "admin";

  const navItems = [
    { path: "/", label: "All Services", icon: LayoutDashboard },
    { path: "/notifications", label: "Notifications", icon: Bell },
    { path: "/reports", label: "Reports", icon: BarChart },
  ];

  const adminItems = [
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  const getServiceStatus = (expiryDate) => {
    if (!expiryDate) return "unknown";
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntil = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return "expired";
    if (daysUntil <= 7) return "danger";
    if (daysUntil <= 30) return "warning";
    return "safe";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "expired": return "text-zinc-400";
      case "danger": return "text-red-500";
      case "warning": return "text-amber-500";
      default: return "text-emerald-500";
    }
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-white/10">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt="Logo"
            className="h-10 w-10 rounded-sm object-contain"
          />
        ) : (
          <div
            className="p-2 rounded-sm border"
            style={{
              backgroundColor: `${branding.primary_color}15`,
              borderColor: `${branding.primary_color}30`
            }}
          >
            <Shield className="h-6 w-6" style={{ color: branding.primary_color }} strokeWidth={1.5} />
          </div>
        )}
        <div>
          <h1 className="font-bold text-lg tracking-tight">{branding.company_name || "Renewal Hub"}</h1>
          <p className="text-xs text-muted-foreground">{branding.company_tagline || "Service Manager"}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto scrollbar-thin">
        {/* Main Navigation */}
        <div className="space-y-1 mb-6">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => {
                setMobileOpen(false);
                if (path === "/") onCategorySelect?.(null);
              }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all duration-200 ${isActive && !selectedCategoryId
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`
              }
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </div>

        {/* Categories Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between px-4 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground/70">
              Categories
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={openCreateCategory}
              data-testid="create-category-btn"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : categoriesWithServices.length === 0 ? (
            <div className="px-4 py-4 text-center">
              <Inbox className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No categories yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {categoriesWithServices.map((rootCategory) => (
                <CategoryItem
                  key={rootCategory.id}
                  category={rootCategory}
                  level={0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Admin Navigation */}
        {isAdmin && (
          <div className="space-y-1 pt-4 border-t border-white/10">
            {adminItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all duration-200 ${isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-foreground/80 hover:text-foreground hover:bg-white/5"
                  }`
                }
                data-testid={`nav-${label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              {isAdmin && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-primary/20 text-primary rounded">
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/60 truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start mt-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          data-testid="logout-btn"
        >
          <LogOut className="h-4 w-4 mr-3" strokeWidth={1.5} />
          Sign Out
        </Button>
      </div>
    </>
  );

  function CategoryItem({ category, level }) {
    const hasChildren = category.children?.length > 0;
    const hasServices = category.services?.length > 0;
    const isExpandable = hasChildren || hasServices;
    const isOpen = expandedCategories[category.id];

    // Compute total services recursively
    const getTotalServices = (cat) => {
      let count = cat.service_count || 0;
      if (cat.children) {
        cat.children.forEach(child => count += getTotalServices(child));
      }
      return count;
    };

    // For leaf nodes (no services, no children), just render as a simple button if needed, 
    // but here everything is treated as potentially having content if isExpandable.
    // If not expandable and top level, maybe just a link? 
    // But currently we use Collapsible for everything for consistency or simple buttons.

    // To support deep nesting, we indent based on level.
    // However, CollapsibleContent usually provides natural indentation if we structure it right.
    // But here we want custom indentation to save horizontal space or use border lines.

    // Simplest approach: Render current node. If open, render children recursively in Content.

    return (
      <div className="space-y-1">
        <Collapsible
          open={isOpen}
          onOpenChange={() => toggleCategory(category.id)}
        >
          <div className={`group flex items-center ${level > 0 ? "ml-2 pl-2 border-l border-white/10" : ""}`}>
            <CollapsibleTrigger asChild>
              <button
                className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded-sm transition-all ${selectedCategoryId === category.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/80 hover:text-foreground hover:bg-white/5"
                  }`}
                onClick={() => {
                  onCategorySelect?.(category.id);
                  if (window.innerWidth < 1024) setMobileOpen(false); // Close mobile menu
                  navigate("/");
                }}
                data-testid={`category-${category.id}`}
              >
                {isExpandable ? (
                  isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                ) : <span className="w-4 shrink-0" />}

                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: category.color || "#06b6d4" }}
                />
                <span className="flex-1 text-left truncate">{category.name}</span>
                {/* Show badge only for total count if > 0 */}
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {getTotalServices(category)}
                </Badge>
              </button>
            </CollapsibleTrigger>

            {/* Action Menu - Only if not uncategorized */}
            {category.id !== "uncategorized" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEditCategory(category)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteCategory(category.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <CollapsibleContent>
            {/* Render Children (Subcategories) first */}
            {hasChildren && (
              <div className="mt-0.5">
                {category.children.map(child => (
                  <CategoryItem key={child.id} category={child} level={level + 1} />
                ))}
              </div>
            )}

            {/* Render Services */}
            {hasServices && (
              <div className={`mt-0.5 ${level >= 0 ? "ml-4 pl-4 border-l border-white/5" : ""}`}>
                {category.services.map(service => (
                  <button
                    key={service.id}
                    onClick={() => {
                      onCategorySelect?.(category.id);
                      navigate("/");
                      if (window.innerWidth < 1024) setMobileOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/70 hover:text-foreground rounded-sm hover:bg-white/5 transition-colors"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="flex-1 text-left truncate">{service.name}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(getServiceStatus(service.expiry_date)).replace('text-', 'bg-')}`} />
                  </button>
                ))}
              </div>
            )}

            {/* Only show "No services" if leaf node with no services */}
            {!hasChildren && !hasServices && (
              <p className="px-8 py-2 text-xs text-muted-foreground italic">Empty</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-sm bg-card border border-border"
        data-testid="mobile-menu-btn"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-40 w-[280px] glass-sidebar flex flex-col transform transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <NavContent />
      </aside>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[280px] bg-gray-100/95 dark:glass-sidebar border-r border-border flex-col">
        <NavContent />
      </aside>

      {/* Category Modal */}
      <Dialog open={categoryModal.open} onOpenChange={(open) => setCategoryModal({ open, category: null })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {categoryModal.category ? "Edit Category" : "Create Category"}
            </DialogTitle>
            <DialogDescription>
              {categoryModal.category
                ? "Update the category details."
                : "Create a new category to organize your services."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Software Licenses"
                data-testid="category-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Optional description..."
                data-testid="category-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Category</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={categoryForm.parent_id || ""}
                onChange={(e) => setCategoryForm({ ...categoryForm, parent_id: e.target.value })}
              >
                <option value="">None (Top Level)</option>
                {allCategories.filter(c => c.id !== categoryModal.category?.id && c.id !== 'uncategorized').sort((a, b) => a.name.localeCompare(b.name)).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {CATEGORY_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCategoryForm({ ...categoryForm, color })}
                    className={`h-8 w-8 rounded-sm transition-all ${categoryForm.color === color ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-110" : ""
                      }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryModal({ open: false, category: null })}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (categoryModal.category ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CategorySidebar;
