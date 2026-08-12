import { useState, useEffect, useRef } from "react";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

interface ProductOffer {
  id: string;
  name: string;
  value: number;
  tag: string;
  created_at: string;
}

interface ProductAsset {
  id: string;
  name: string;
  r2_key: string;
  public_url: string;
  file_type: string;
  tag: string | null;
  is_delivery_file: number;
  created_at: string;
}

interface ProductDeliveryLink {
  id: string;
  title: string;
  login_url: string;
  instructions: string | null;
  video_url: string | null;
  product_code: string | null;
  created_at: string;
}

interface ProductAutomation {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface ProductUpsell {
  id: string;
  product_id: string;
  upsell_sku: string;
  upsell_name: string | null;
  upsell_url: string | null;
  use_main_login_url: number;
  delay_minutes: number;
  price: number;
  created_at: string;
  updated_at: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  deliver_pdfs: number;
  deliver_links: number;
  offers: ProductOffer[];
  assets: ProductAsset[];
  deliveryLinks: ProductDeliveryLink[];
  automations: ProductAutomation[];
  upsell?: ProductUpsell | null;
  created_at: string;
}

interface SystemAutomation {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function ProductsPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [systemAutomations, setSystemAutomations] = useState<SystemAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Abas do painel detalhado
  const [activeDetailTab, setActiveDetailTab] = useState<"general" | "support_assets" | "delivery_pdfs" | "delivery_links" | "automations">("general");
  
  // Modais e Estados de Criação de Produto
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [newProductPdfs, setNewProductPdfs] = useState(false);
  const [newProductLinks, setNewProductLinks] = useState(false);
  const [newProductAutos, setNewProductAutos] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  
  // Estados de Edição do Produto Selecionado
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPdfs, setEditPdfs] = useState(false);
  const [editLinks, setEditLinks] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Estados para Formulários Rápidos (Ofertas)
  const [offerName, setOfferName] = useState("");
  const [offerValue, setOfferValue] = useState("");
  const [offerTag, setOfferTag] = useState("principal");
  const [addingOffer, setAddingOffer] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [customOfferTag, setCustomOfferTag] = useState("");
  const [hasManuallyEditedTag, setHasManuallyEditedTag] = useState(false);
  
  // Estados para Formulários Rápidos (Acessos)
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInstructions, setLinkInstructions] = useState("");
  const [linkVideo, setLinkVideo] = useState("");
  const [linkProductCode, setLinkProductCode] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  
  // Estados para Upload no R2 (Mídias de Apoio e PDFs)
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTag, setUploadTag] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados adicionais para URL Externa e tag nos PDFs
  const [supportUploadType, setSupportUploadType] = useState<"file" | "url">("file");
  const [supportUrl, setSupportUrl] = useState("");
  const [supportFileName, setSupportFileName] = useState("");
  const [supportFileType, setSupportFileType] = useState<"audio" | "video" | "image" | "pdf">("audio");
  
  const [deliveryUploadType, setDeliveryUploadType] = useState<"file" | "url">("file");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [deliveryFileName, setDeliveryFileName] = useState("");
  const [pdfTag, setPdfTag] = useState("");
  const [addingAssetLink, setAddingAssetLink] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  
  const [upsellSku, setUpsellSku] = useState("");
  const [upsellName, setUpsellName] = useState("");
  const [upsellUrl, setUpsellUrl] = useState("");
  const [useMainLoginUrl, setUseMainLoginUrl] = useState(true);
  const [upsellDelayMinutes, setUpsellDelayMinutes] = useState(5);
  const [upsellPrice, setUpsellPrice] = useState(14.50);
  const [savingUpsell, setSavingUpsell] = useState(false);

  const [toast, setToast] = useState("");

  useEffect(() => {
    if (user) {
      loadProducts();
      loadSystemAutomations();
    }
  }, [user]);

  function slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_ -]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_");
  }

  useEffect(() => {
    if (offerTag === "personalizado" && !hasManuallyEditedTag) {
      setCustomOfferTag(slugify(offerName));
    }
  }, [offerName, offerTag, hasManuallyEditedTag]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function loadProducts(selectId?: string) {
    setLoading(true);
    try {
      const res = await apiFetch("/products");
      if (res.ok) {
        const data = await res.json() as { data: Product[] };
        setProducts(data.data);
        
        // Recarregar o produto selecionado atualmente para atualizar metadados filhas
        if (selectId) {
          const updated = data.data.find(p => p.id === selectId);
          if (updated) {
            setSelectedProduct(updated);
            syncProductFormStates(updated);
          }
        } else if (selectedProduct) {
          const updated = data.data.find(p => p.id === selectedProduct.id);
          if (updated) {
            setSelectedProduct(updated);
            syncProductFormStates(updated);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      showToast("Erro de conexão ao carregar produtos.");
    }
    setLoading(false);
  }

  async function loadSystemAutomations() {
    try {
      const res = await apiFetch("/automations");
      if (res.ok) {
        const data = await res.json() as { data: SystemAutomation[] };
        setSystemAutomations(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncProductFormStates(prod: Product) {
    setEditName(prod.name);
    setEditDesc(prod.description || "");
    setEditPdfs(prod.deliver_pdfs === 1);
    setEditLinks(prod.deliver_links === 1);
    setUpsellSku(prod.upsell?.upsell_sku || "");
    setUpsellName(prod.upsell?.upsell_name || "");
    setUpsellUrl(prod.upsell?.upsell_url || "");
    setUseMainLoginUrl(prod.upsell ? prod.upsell.use_main_login_url === 1 : true);
    setUpsellDelayMinutes(prod.upsell?.delay_minutes ?? 5);
    setUpsellPrice(prod.upsell?.price ?? 14.50);
  }

  function handleSelectProduct(prod: Product) {
    setSelectedProduct(prod);
    syncProductFormStates(prod);
    setActiveDetailTab("general");
    
    // Limpar estados de formulários rápidos e uploads
    setOfferName("");
    setOfferValue("");
    setOfferTag("principal");
    setEditingOfferId(null);
    setCustomOfferTag("");
    setHasManuallyEditedTag(false);
    setLinkTitle("");
    setLinkUrl("");
    setLinkInstructions("");
    setLinkVideo("");
    setLinkProductCode("");
    setUploadFile(null);
    setUploadTag("");
    setUploadProgress(null);
  }

  // ─────────────────────────────────────────────────────────────
  // AÇÕES DE PRODUTOS
  // ─────────────────────────────────────────────────────────────

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProductName) {
      showToast("O nome do produto é obrigatório.");
      return;
    }
    
    setCreating(true);
    try {
      const res = await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: newProductName,
          description: newProductDesc || undefined,
          deliver_pdfs: newProductPdfs ? 1 : 0,
          deliver_links: newProductLinks ? 1 : 0,
          automation_ids: newProductAutos
        })
      });
      
      if (res.ok) {
        const data = await res.json() as { data: { id: string } };
        showToast("Produto criado com sucesso!");
        closeCreateModal();
        await loadProducts(data.data.id);
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao criar produto.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setCreating(false);
  }

  async function handleUpdateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    
    setUpdating(true);
    try {
      const res = await apiFetch(`/products/${selectedProduct.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          description: editDesc || "",
          deliver_pdfs: editPdfs ? 1 : 0,
          deliver_links: editLinks ? 1 : 0
        })
      });
      
      if (res.ok) {
        showToast("Produto atualizado!");
        await loadProducts(selectedProduct.id);
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao atualizar produto.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setUpdating(false);
  }

  async function handleDeleteProduct(id: string, name: string) {
    if (!confirm(`Tem certeza absoluta que deseja excluir o produto "${name}"?\n\nIsso apagará permanentemente todas as mídias associadas no R2, ofertas, links e associações.`)) {
      return;
    }
    
    try {
      const res = await apiFetch(`/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Produto excluído com sucesso!");
        setSelectedProduct(null);
        loadProducts();
      } else {
        showToast("Erro ao excluir produto.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setUpdating(false);
  }

  async function handleSaveUpsell(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!upsellSku) {
      showToast("O SKU do upsell é obrigatório.");
      return;
    }

    setSavingUpsell(true);
    try {
      const res = await apiFetch(`/products/${selectedProduct.id}/upsell`, {
        method: "PUT",
        body: JSON.stringify({
          upsell_sku: upsellSku,
          upsell_name: upsellName || undefined,
          upsell_url: useMainLoginUrl ? null : upsellUrl,
          use_main_login_url: useMainLoginUrl ? 1 : 0,
          delay_minutes: upsellDelayMinutes,
          price: upsellPrice
        })
      });

      if (res.ok) {
        showToast("Configuração de Upsell salva com sucesso!");
        await loadProducts(selectedProduct.id);
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao salvar configuração do Upsell.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setSavingUpsell(false);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setNewProductName("");
    setNewProductDesc("");
    setNewProductPdfs(false);
    setNewProductLinks(false);
    setNewProductAutos([]);
  }

  function toggleNewProductAuto(autoId: string) {
    setNewProductAutos(prev =>
      prev.includes(autoId) ? prev.filter(id => id !== autoId) : [...prev, autoId]
    );
  }

  // ─────────────────────────────────────────────────────────────
  // AÇÕES DE ASSOCIAÇÃO DE AUTOMAÇÃO (Muitos para Muitos)
  // ─────────────────────────────────────────────────────────────

  async function handleToggleAutomationRelation(automationId: string, isRelated: boolean) {
    if (!selectedProduct) return;
    
    const currentAutos = selectedProduct.automations.map(a => a.id);
    let updatedAutos = [];
    
    if (isRelated) {
      updatedAutos = [...currentAutos, automationId];
    } else {
      updatedAutos = currentAutos.filter(id => id !== automationId);
    }
    
    try {
      const res = await apiFetch(`/products/${selectedProduct.id}`, {
        method: "PUT",
        body: JSON.stringify({ automation_ids: updatedAutos })
      });
      
      if (res.ok) {
        await loadProducts(selectedProduct.id);
      } else {
        showToast("Erro ao atualizar relações.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // AÇÕES DE OFERTAS (Values)
  // ─────────────────────────────────────────────────────────────

  async function handleAddOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    
    const finalTag = offerTag === "personalizado" ? customOfferTag : offerTag;
    
    if (!offerName || !offerValue || !finalTag) {
      showToast("Preencha o nome, valor e tag da oferta.");
      return;
    }
    
    const parsedValue = parseFloat(offerValue);
    if (isNaN(parsedValue)) {
      showToast("O valor deve ser numérico.");
      return;
    }
    
    setAddingOffer(true);
    try {
      if (editingOfferId) {
        // Editar Oferta Existente
        const res = await apiFetch(`/products/offers/${editingOfferId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: offerName,
            value: parsedValue,
            tag: finalTag.trim().toLowerCase()
          })
        });
        
        if (res.ok) {
          showToast("Oferta atualizada!");
          setOfferName("");
          setOfferValue("");
          setOfferTag("principal");
          setEditingOfferId(null);
          setCustomOfferTag("");
          setHasManuallyEditedTag(false);
          await loadProducts(selectedProduct.id);
        } else {
          const data = await res.json() as { error: string };
          showToast(data.error || "Erro ao atualizar oferta.");
        }
      } else {
        // Criar Nova Oferta
        const res = await apiFetch(`/products/${selectedProduct.id}/offers`, {
          method: "POST",
          body: JSON.stringify({
            name: offerName,
            value: parsedValue,
            tag: finalTag.trim().toLowerCase()
          })
        });
        
        if (res.ok) {
          showToast("Oferta cadastrada!");
          setOfferName("");
          setOfferValue("");
          setOfferTag("principal");
          setCustomOfferTag("");
          setHasManuallyEditedTag(false);
          await loadProducts(selectedProduct.id);
        } else {
          const data = await res.json() as { error: string };
          showToast(data.error || "Erro ao cadastrar oferta.");
        }
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setAddingOffer(false);
  }

  function handleStartEditOffer(o: ProductOffer) {
    setEditingOfferId(o.id);
    setOfferName(o.name);
    setOfferValue(o.value.toString());
    
    const presets = ["principal", "downsell", "especial", "upsell", "downsell_2"];
    if (presets.includes(o.tag)) {
      setOfferTag(o.tag);
      setCustomOfferTag("");
    } else {
      setOfferTag("personalizado");
      setCustomOfferTag(o.tag);
      setHasManuallyEditedTag(true);
    }
  }

  async function handleDeleteOffer(offerId: string) {
    if (!selectedProduct) return;
    if (!confirm("Tem certeza que deseja excluir esta oferta?")) return;
    
    try {
      const res = await apiFetch(`/products/offers/${offerId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Oferta excluída!");
        await loadProducts(selectedProduct.id);
      } else {
        showToast("Erro ao excluir oferta.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // AÇÕES DE LINKS (Áreas de Membros)
  // ─────────────────────────────────────────────────────────────

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!linkTitle || !linkUrl) {
      showToast("O título e a URL de login são obrigatórios.");
      return;
    }
    
    setAddingLink(true);
    try {
      if (editingLinkId) {
        // Edição
        const res = await apiFetch(`/products/delivery-links/${editingLinkId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: linkTitle,
            login_url: linkUrl,
            instructions: linkInstructions || "",
            video_url: linkVideo || "",
            product_code: linkProductCode || ""
          })
        });
        
        if (res.ok) {
          showToast("Acesso atualizado!");
          setLinkTitle("");
          setLinkUrl("");
          setLinkInstructions("");
          setLinkVideo("");
          setLinkProductCode("");
          setEditingLinkId(null);
          await loadProducts(selectedProduct.id);
        } else {
          const data = await res.json() as { error: string };
          showToast(data.error || "Erro ao atualizar acesso.");
        }
      } else {
        // Criação
        const res = await apiFetch(`/products/${selectedProduct.id}/delivery-links`, {
          method: "POST",
          body: JSON.stringify({
            title: linkTitle,
            login_url: linkUrl,
            instructions: linkInstructions || undefined,
            video_url: linkVideo || undefined,
            product_code: linkProductCode || undefined
          })
        });
        
        if (res.ok) {
          showToast("Acesso cadastrado!");
          setLinkTitle("");
          setLinkUrl("");
          setLinkInstructions("");
          setLinkVideo("");
          setLinkProductCode("");
          await loadProducts(selectedProduct.id);
        } else {
          const data = await res.json() as { error: string };
          showToast(data.error || "Erro ao cadastrar acesso.");
        }
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setAddingLink(false);
  }

  function handleStartEditLink(l: ProductDeliveryLink) {
    setEditingLinkId(l.id);
    setLinkTitle(l.title);
    setLinkUrl(l.login_url);
    setLinkInstructions(l.instructions || "");
    setLinkVideo(l.video_url || "");
    setLinkProductCode(l.product_code || "");
  }


  async function handleDeleteLink(linkId: string) {
    if (!selectedProduct) return;
    if (!confirm("Tem certeza que deseja excluir este link de acesso?")) return;
    
    try {
      const res = await apiFetch(`/products/delivery-links/${linkId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Acesso excluído!");
        await loadProducts(selectedProduct.id);
      } else {
        showToast("Erro ao excluir link.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UPLOADS PARA O CLOUDFLARE R2
  // ─────────────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, isPdfOnly = false) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isPdfOnly && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Formato inválido. Por favor, envie apenas arquivos em PDF.");
        return;
      }
      setUploadFile(file);
    }
  }

  async function handleUploadToR2(isDeliveryPdf: boolean) {
    if (!selectedProduct) return;
    if (!uploadFile) {
      showToast("Por favor, selecione um arquivo primeiro.");
      return;
    }
    const targetTag = isDeliveryPdf ? pdfTag : uploadTag;
    if (!isDeliveryPdf && !targetTag) {
      showToast("Por favor, defina uma tag para a mídia de apoio do funil.");
      return;
    }
    
    setUploading(true);
    setUploadProgress(10);
    
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("is_delivery_file", isDeliveryPdf ? "true" : "false");
      if (targetTag) {
        formData.append("tag", targetTag.trim().toLowerCase());
      }
      
      setUploadProgress(35);
      
      // Obter o token ativo do AuthContext para o cabeçalho manual (XMLHttpRequest ou Fetch manual)
      const token = localStorage.getItem("auth_token") || "";
      
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://automacao-zap.projetobrlatam.workers.dev/api/products/${selectedProduct.id}/upload`, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 90);
          setUploadProgress(pct);
        }
      };
      
      xhr.onload = async () => {
        if (xhr.status === 200 || xhr.status === 201) {
          setUploadProgress(100);
          showToast("Arquivo enviado ao R2 e registrado!");
          setUploadFile(null);
          setUploadTag("");
          setPdfTag("");
          if (fileInputRef.current) fileInputRef.current.value = "";
          
          setTimeout(async () => {
            setUploadProgress(null);
            await loadProducts(selectedProduct.id);
          }, 800);
        } else {
          try {
            const err = JSON.parse(xhr.responseText) as { error: string };
            showToast(err.error || "Erro de upload no R2");
          } catch {
            showToast(`Erro HTTP ${xhr.status} no upload.`);
          }
          setUploadProgress(null);
        }
        setUploading(false);
      };
      
      xhr.onerror = () => {
        showToast("Erro de rede no upload.");
        setUploadProgress(null);
        setUploading(false);
      };
      
      xhr.send(formData);
      
    } catch (err: any) {
      console.error(err);
      showToast("Erro ao preparar upload.");
      setUploadProgress(null);
      setUploading(false);
    }
  }

  async function handleAddExternalAsset(isDeliveryPdf: boolean) {
    if (!selectedProduct) return;
    
    const url = isDeliveryPdf ? deliveryUrl : supportUrl;
    const name = isDeliveryPdf ? deliveryFileName : supportFileName;
    const fileType = isDeliveryPdf ? "pdf" : supportFileType;
    const tag = isDeliveryPdf ? pdfTag : uploadTag;
    
    if (!url || !name) {
      showToast("Por favor, preencha o nome do arquivo e a URL.");
      return;
    }
    
    setAddingAssetLink(true);
    try {
      const res = await apiFetch(`/products/${selectedProduct.id}/assets-link`, {
        method: "POST",
        body: JSON.stringify({
          name,
          public_url: url.trim(),
          file_type: fileType,
          tag: tag ? tag.trim().toLowerCase() : undefined,
          is_delivery_file: isDeliveryPdf ? 1 : 0
        })
      });
      
      if (res.ok) {
        showToast("Link externo cadastrado com sucesso!");
        if (isDeliveryPdf) {
          setDeliveryUrl("");
          setDeliveryFileName("");
          setPdfTag("");
        } else {
          setSupportUrl("");
          setSupportFileName("");
          setUploadTag("");
        }
        await loadProducts(selectedProduct.id);
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao cadastrar link externo.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
    setAddingAssetLink(false);
  }

  async function handleDeleteAsset(assetId: string) {
    if (!selectedProduct) return;
    if (!confirm("Tem certeza que deseja excluir permanentemente este arquivo? Ele será deletado do Cloudflare R2!")) return;
    
    try {
      const res = await apiFetch(`/products/assets/${assetId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Arquivo removido do R2 e do banco de dados!");
        await loadProducts(selectedProduct.id);
      } else {
        showToast("Erro ao remover arquivo.");
      }
    } catch {
      showToast("Erro de conexão.");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    showToast("Link do arquivo copiado para o clipboard!");
  }

  // Filtrar mídias de apoio vs PDFs de entrega
  const supportAssets = selectedProduct?.assets.filter(a => a.is_delivery_file === 0) || [];
  const deliveryPdfs = selectedProduct?.assets.filter(a => a.is_delivery_file === 1) || [];

  return (
    <AppLayout title="Produtos & Entrega">
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "stretch", maxWidth: "100%", overflowX: "hidden" }}>
        
        {/* COLUNA ESQUERDA: LISTA DE PRODUTOS */}
        <div style={{
          flex: isMobile ? "1 1 100%" : "0 0 280px",
          minWidth: isMobile ? "100%" : "260px",
          display: isMobile && selectedProduct ? "none" : "block"
        }}>


          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: "800", margin: 0 }}>Produtos</h2>
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "2px" }}>Selecione para gerenciar</div>
            </div>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ padding: "6px 12px", fontSize: "12px", height: "32px", borderRadius: "8px" }}>
              📦 Criar
            </button>
          </div>

          {loading && products.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
              <div className="spinner" style={{ width: "32px", height: "32px" }} />
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="empty-state-icon" style={{ fontSize: "36px" }}>📦</div>
              <div className="empty-state-title" style={{ fontSize: "14px" }}>Nenhum produto</div>
              <div className="empty-state-text" style={{ fontSize: "11px" }}>Crie seu primeiro produto para gerenciar preços, bônus, PDFs e acessos.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {products.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: isSelected ? "rgba(12,147,242,0.08)" : "rgba(255,255,255,0.02)",
                      border: isSelected ? "1px solid rgba(12,147,242,0.4)" : "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                      boxShadow: isSelected ? "0 0 12px rgba(12,147,242,0.1)" : "none",
                    }}
                    className={isSelected ? "" : "hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)]"}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px", marginBottom: "6px" }}>
                      <h3 style={{ fontSize: "14px", fontWeight: "700", color: isSelected ? "var(--color-brand-400)" : "var(--color-text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {p.name}
                      </h3>
                      <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                        {p.deliver_pdfs === 1 && <span className="badge badge-success" style={{ fontSize: "8px", padding: "1px 4px" }} title="Entrega PDFs">📂</span>}
                        {p.deliver_links === 1 && <span className="badge badge-info" style={{ fontSize: "8px", padding: "1px 4px" }} title="Entrega Acessos">🔑</span>}
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--color-text-muted)" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <span title="Ofertas/Preços">💰 {p.offers.length}</span>
                        <span title="Arquivos/Mídias">📎 {p.assets.length}</span>
                        <span title="Funis Vinculados">⚙️ {p.automations.length}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id, p.name); }}
                        style={{ background: "none", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", padding: "2px" }}
                        className="hover:text-red-500"
                        title="Deletar Produto"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: PAINEL DETALHADO DO PRODUTO SELECIONADO */}
        <div style={{
          flex: 1,
          minWidth: isMobile ? "100%" : "320px",
          display: isMobile && !selectedProduct ? "none" : "flex",
          maxWidth: "100%",
          overflowX: "hidden"
        }}>
          {!selectedProduct ? (
            <div className="glass-card" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "42px", marginBottom: "16px" }}>📦</div>
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Selecione um Produto</h3>
              <p style={{ color: "var(--color-text-muted)", fontSize: "13px", marginTop: "6px", maxWidth: "320px", lineHeight: "1.5" }}>
                Clique em um produto da lista lateral para carregar o seu gerenciador de preços, upload de arquivos no R2 e formas de entrega.
              </p>
            </div>
          ) : (
            <div className="glass-card" style={{ flex: 1, padding: isMobile ? "16px" : "28px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
                <div style={{ width: "100%" }}>
                  {isMobile && (
                    <button
                      onClick={() => setSelectedProduct(null)}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: "var(--color-brand-400)",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginBottom: "16px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      ◀ Voltar para a lista
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: "22px", fontWeight: "800", margin: 0 }}>{selectedProduct.name}</h2>
                    <span className="badge badge-info" style={{ fontSize: "10px" }}>ID do Produto: {selectedProduct.id.slice(0, 8)}</span>
                  </div>
                  {selectedProduct.description && (
                    <div style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      borderLeft: "3px solid var(--color-brand-400)",
                      padding: "12px 16px",
                      borderRadius: "0 10px 10px 0",
                      marginTop: "12px",
                      fontSize: "14px",
                      lineHeight: "1.5",
                      color: "var(--color-text-secondary)",
                      borderTop: "1px solid rgba(255,255,255,0.03)",
                      borderRight: "1px solid rgba(255,255,255,0.03)",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}>
                      {selectedProduct.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Tab Bar Interna */}
              <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "20px", overflowX: "auto" }}>
                {[
                  { id: "general", label: "⚙️ Configs" },
                  { id: "support_assets", label: "📢 Mídias de Funil" },
                  { id: "delivery_pdfs", label: `📂 PDFs (${deliveryPdfs.length})` },
                  { id: "delivery_links", label: `🔑 Acessos (${selectedProduct.deliveryLinks.length})` },
                  { id: "automations", label: "🤖 Funis Vinculados" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id as any)}
                    style={{
                      padding: "8px 14px",
                      background: "none",
                      border: "none",
                      borderBottom: activeDetailTab === tab.id ? "2px solid var(--color-brand-400)" : "2px solid transparent",
                      color: activeDetailTab === tab.id ? "var(--color-brand-400)" : "var(--color-text-secondary)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* CONTEÚDO DAS ABAS */}
              <div style={{ flex: 1 }}>
                
                {/* ABA 1: CONFIGS GERAIS */}
                {activeDetailTab === "general" && (
                  <form onSubmit={handleUpdateProduct}>
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Nome do Produto</label>
                      <input className="input-field" style={{ fontSize: "15px", padding: "12px 16px" }} placeholder="Ex: Receitas de Recheios Gourmet" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                    </div>
                    
                    <div style={{ marginBottom: "24px" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Descrição</label>
                      <textarea className="input-field" rows={4} style={{ fontSize: "15px", padding: "12px 16px", resize: "vertical" }} placeholder="Descreva os bônus e o que o produto engloba..." value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                    </div>

                    <div style={{ display: "flex", gap: "28px", marginBottom: "24px", padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                        <input type="checkbox" checked={editPdfs} onChange={(e) => setEditPdfs(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-brand-400)" }} />
                        📂 Entregar PDFs no WhatsApp
                      </label>
                      
                      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                        <input type="checkbox" checked={editLinks} onChange={(e) => setEditLinks(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-brand-400)" }} />
                        🔑 Entregar Links de Áreas de Membros
                      </label>
                    </div>

                    <button type="submit" className="btn-primary" disabled={updating}>
                      {updating ? "Salvando..." : "💾 Salvar Configurações"}
                    </button>
                  </form>
                )}
                {/* ABA 3: MÍDIAS DE FUNIL (APOIO) */}
                {activeDetailTab === "support_assets" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0 }}>📢 Mídias Alternativas e Apoio (Funil)</h3>
                      <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "2px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <button type="button" onClick={() => setSupportUploadType("file")} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px", border: "none", background: supportUploadType === "file" ? "rgba(12,147,242,0.15)" : "transparent", color: supportUploadType === "file" ? "var(--color-brand-400)" : "var(--color-text-secondary)", fontWeight: "600", cursor: "pointer" }}>Upload R2</button>
                        <button type="button" onClick={() => setSupportUploadType("url")} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px", border: "none", background: supportUploadType === "url" ? "rgba(12,147,242,0.15)" : "transparent", color: supportUploadType === "url" ? "var(--color-brand-400)" : "var(--color-text-secondary)", fontWeight: "600", cursor: "pointer" }}>URL Externa</button>
                      </div>
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "-4px", marginBottom: "16px", lineHeight: "1.4" }}>
                      Cadastre mídias de áudio (.mp3), vídeo (.mp4) ou imagem (.jpeg/.png) fazendo upload para o R2 ou colando uma URL externa de outro servidor.
                    </p>

                    {supportUploadType === "file" ? (
                      <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", marginBottom: "24px" }}>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
                          <div style={{ flex: 1, minWidth: "180px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Arquivo de Mídia</label>
                            <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e)} style={{ display: "none" }} accept="audio/*,video/*,image/*" />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ width: "100%", height: "38px", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {uploadFile ? `📁 ${uploadFile.name}` : "📂 Escolher Áudio/Vídeo/Imagem..."}
                            </button>
                          </div>
                          
                          <div style={{ width: "160px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Tag de Funil</label>
                            <input className="input-field" placeholder="Ex: audio_boas_vindas" value={uploadTag} onChange={(e) => setUploadTag(e.target.value)} style={{ margin: 0, height: "38px" }} />
                          </div>
                          
                          <div style={{ marginTop: "17px" }}>
                            <button type="button" onClick={() => handleUploadToR2(false)} className="btn-primary" style={{ height: "38px" }} disabled={uploading}>
                              {uploading ? "Subindo..." : "⚡ Subir R2"}
                            </button>
                          </div>
                        </div>
                        
                        {uploadProgress !== null && (
                          <div style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: "10px", height: "8px", overflow: "hidden", position: "relative" }}>
                            <div style={{ height: "100%", background: "var(--color-brand-400)", width: `${uploadProgress}%`, transition: "width 0.2s ease" }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); handleAddExternalAsset(false); }} style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", marginBottom: "24px" }}>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                          <div style={{ flex: 1, minWidth: "150px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Nome da Mídia</label>
                            <input className="input-field" placeholder="Ex: Áudio de Boas Vindas" value={supportFileName} onChange={(e) => setSupportFileName(e.target.value)} required style={{ margin: 0, height: "38px" }} />
                          </div>
                          
                          <div style={{ flex: 1.5, minWidth: "200px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>URL da Mídia Externa</label>
                            <input className="input-field" placeholder="Ex: https://meuservidor.com/audio.mp3" value={supportUrl} onChange={(e) => setSupportUrl(e.target.value)} required style={{ margin: 0, height: "38px" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "10px" }}>
                          <div style={{ width: "120px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Tipo do Arquivo</label>
                            <select className="input-field" value={supportFileType} onChange={(e) => setSupportFileType(e.target.value as any)} style={{ margin: 0, height: "38px" }}>
                              <option value="audio">🎵 Áudio</option>
                              <option value="video">🎥 Vídeo</option>
                              <option value="image">🖼️ Imagem</option>
                              <option value="pdf">📂 PDF</option>
                            </select>
                          </div>
                          
                          <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Tag de Funil</label>
                            <input className="input-field" placeholder="Ex: audio_boas_vindas" value={uploadTag} onChange={(e) => setUploadTag(e.target.value)} style={{ margin: 0, height: "38px" }} />
                          </div>
                          
                          <button type="submit" className="btn-primary" style={{ height: "38px" }} disabled={addingAssetLink}>
                            {addingAssetLink ? "Salvando..." : "🔗 Vincular Link"}
                          </button>
                        </div>
                      </form>
                    )}

                    <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>Mídias de Funil Ativas</h3>
                    {supportAssets.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "10px", textAlign: "center" }}>Nenhum arquivo de marketing associado ao funil deste produto.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                        {supportAssets.map((a) => (
                          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "250px" }}>{a.name}</span>
                                <span className={`badge ${a.file_type === "audio" ? "badge-info" : a.file_type === "video" ? "badge-warning" : "badge-success"}`} style={{ fontSize: "9px" }}>
                                  {a.file_type}
                                </span>
                                {a.tag && <span className="badge badge-purple" style={{ fontSize: "9px" }}>tag: {a.tag}</span>}
                              </div>
                              <code style={{ fontSize: "10px", color: "var(--color-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{a.public_url}</code>
                            </div>
                            <div style={{ display: "flex", gap: "8px", marginLeft: "12px" }}>
                              <button onClick={() => copyToClipboard(a.public_url)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "13px" }} title="Copiar URL">📋</button>
                              <button onClick={() => handleDeleteAsset(a.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", fontSize: "12px" }} className="hover:text-red-500" title="Excluir Mídia">🗑️</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 4: PDFs DE ENTREGA DO PRODUTO */}
                {activeDetailTab === "delivery_pdfs" && (
                  <div>
                    {!editPdfs ? (
                      <div className="empty-state" style={{ padding: "30px 20px" }}>
                        <div className="empty-state-icon">📂</div>
                        <div className="empty-state-title" style={{ fontSize: "14px" }}>Entrega de PDFs Desativada</div>
                        <div className="empty-state-text" style={{ fontSize: "12px", maxWidth: "260px" }}>Ative a opção "Entregar PDFs no WhatsApp" na aba Configs para liberar o gerenciador de receitas.</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                          <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0 }}>📂 PDFs e Apostilas de Entrega</h3>
                          <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "2px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <button type="button" onClick={() => setDeliveryUploadType("file")} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px", border: "none", background: deliveryUploadType === "file" ? "rgba(12,147,242,0.15)" : "transparent", color: deliveryUploadType === "file" ? "var(--color-brand-400)" : "var(--color-text-secondary)", fontWeight: "600", cursor: "pointer" }}>Upload R2</button>
                            <button type="button" onClick={() => setDeliveryUploadType("url")} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px", border: "none", background: deliveryUploadType === "url" ? "rgba(12,147,242,0.15)" : "transparent", color: deliveryUploadType === "url" ? "var(--color-brand-400)" : "var(--color-text-secondary)", fontWeight: "600", cursor: "pointer" }}>URL Externa</button>
                          </div>
                        </div>
                        <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "-4px", marginBottom: "16px", lineHeight: "1.4" }}>
                          Suba as apostilas em PDF fazendo upload diretamente para o R2 ou colando uma URL externa de outro servidor. E lembre-se de cadastrar uma tag para que a IA saiba quando enviar!
                        </p>

                        {deliveryUploadType === "file" ? (
                          <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", marginBottom: "24px" }}>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
                              <div style={{ flex: 1, minWidth: "180px" }}>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Apostila PDF</label>
                                <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e, true)} style={{ display: "none" }} accept="application/pdf" />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ width: "100%", height: "38px", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {uploadFile ? `📁 ${uploadFile.name}` : "📂 Selecionar Documento PDF..."}
                                </button>
                              </div>
                              
                              <div style={{ width: "160px" }}>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Tag do PDF (IA)</label>
                                <input className="input-field" placeholder="Ex: apostila_principal" value={pdfTag} onChange={(e) => setPdfTag(e.target.value)} style={{ margin: 0, height: "38px" }} />
                              </div>
                              
                              <div style={{ marginTop: "17px" }}>
                                <button type="button" onClick={() => handleUploadToR2(true)} className="btn-primary" style={{ height: "38px" }} disabled={uploading}>
                                  {uploading ? "Subindo..." : "⚡ Subir R2"}
                                </button>
                              </div>
                            </div>
                            
                            {uploadProgress !== null && (
                              <div style={{ width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: "10px", height: "8px", overflow: "hidden", position: "relative" }}>
                                <div style={{ height: "100%", background: "var(--color-brand-400)", width: `${uploadProgress}%`, transition: "width 0.2s ease" }} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <form onSubmit={(e) => { e.preventDefault(); handleAddExternalAsset(true); }} style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", marginBottom: "24px" }}>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                              <div style={{ flex: 1, minWidth: "150px" }}>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Nome do PDF</label>
                                <input className="input-field" placeholder="Ex: Apostila Recheios Principais.pdf" value={deliveryFileName} onChange={(e) => setDeliveryFileName(e.target.value)} required style={{ margin: 0, height: "38px" }} />
                              </div>
                              
                              <div style={{ flex: 1.5, minWidth: "200px" }}>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>URL do PDF Externo</label>
                                <input className="input-field" placeholder="Ex: https://meudrive.com/apostila.pdf" value={deliveryUrl} onChange={(e) => setDeliveryUrl(e.target.value)} required style={{ margin: 0, height: "38px" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "10px" }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Tag do PDF (IA)</label>
                                <input className="input-field" placeholder="Ex: apostila_principal" value={pdfTag} onChange={(e) => setPdfTag(e.target.value)} style={{ margin: 0, height: "38px" }} />
                              </div>
                              
                              <button type="submit" className="btn-primary" style={{ height: "38px" }} disabled={addingAssetLink}>
                                {addingAssetLink ? "Salvando..." : "🔗 Vincular Link"}
                              </button>
                            </div>
                          </form>
                        )}

                        <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>Apostilas PDFs Ativas</h3>
                        {deliveryPdfs.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "10px", textAlign: "center" }}>Nenhum PDF cadastrado como entrega para este produto.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                            {deliveryPdfs.map((a) => (
                              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    <span style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "280px" }}>{a.name}</span>
                                    <span className="badge badge-success" style={{ fontSize: "9px" }}>pdf</span>
                                    {a.tag && <span className="badge badge-purple" style={{ fontSize: "9px" }}>tag: {a.tag}</span>}
                                  </div>
                                  <code style={{ fontSize: "10px", color: "var(--color-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{a.public_url}</code>
                                </div>
                                <div style={{ display: "flex", gap: "8px", marginLeft: "12px" }}>
                                  <button onClick={() => copyToClipboard(a.public_url)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "13px" }} title="Copiar URL">📋</button>
                                  <button onClick={() => handleDeleteAsset(a.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", fontSize: "12px" }} className="hover:text-red-500" title="Excluir PDF">🗑️</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 5: LINKS DE ACESSO (ÁREAS DE MEMBROS) */}
                {activeDetailTab === "delivery_links" && (
                  <div>
                    {!editLinks ? (
                      <div className="empty-state" style={{ padding: "30px 20px" }}>
                        <div className="empty-state-icon">🔑</div>
                        <div className="empty-state-title" style={{ fontSize: "14px" }}>Acesso de Área de Membros Desativada</div>
                        <div className="empty-state-text" style={{ fontSize: "12px", maxWidth: "260px" }}>Ative a opção "Entregar Links de Áreas de Membros" na aba Configs para gerenciar as credenciais de login.</div>
                      </div>
                    ) : (
                      <div>
                        <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>
                          {editingLinkId ? "✏️ Editar Acesso à Área de Membros" : "🔑 Cadastrar Acesso à Área de Membros"}
                        </h3>
                        
                        <form onSubmit={handleAddLink} style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px", padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <div style={{ flex: 1.2, minWidth: "150px" }}>
                              <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Nome do Curso/Acesso</label>
                              <input className="input-field" placeholder="Ex: Portal de Alunas - Kit Completo" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} style={{ margin: 0, height: "38px" }} />
                            </div>
                            
                            <div style={{ flex: 1.5, minWidth: "180px" }}>
                              <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>URL de Login</label>
                              <input className="input-field" placeholder="Ex: https://app.promentor21.top/login" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={{ margin: 0, height: "38px" }} />
                            </div>

                            <div style={{ flex: 0.8, minWidth: "120px" }}>
                              <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Código do Produto (SKU)</label>
                              <input className="input-field" placeholder="Ex: PROD-R1I27D" value={linkProductCode} onChange={(e) => setLinkProductCode(e.target.value)} style={{ margin: 0, height: "38px" }} />
                            </div>
                          </div>
                          
                          <div>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Instruções de Acesso</label>
                            <input className="input-field" placeholder="Ex: Para logar utilize o seu e-mail cadastrado e sua senha padrão." value={linkInstructions} onChange={(e) => setLinkInstructions(e.target.value)} style={{ margin: 0, height: "38px" }} />
                          </div>
                          
                          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: "200px" }}>
                              <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", fontWeight: "600" }}>Vídeo Explicativo de Suporte (URL opcional)</label>
                              <input className="input-field" placeholder="Ex: https://youtube.com/shorts/..." value={linkVideo} onChange={(e) => setLinkVideo(e.target.value)} style={{ margin: 0, height: "38px" }} />
                            </div>
                            
                            <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                              {editingLinkId && (
                                <button type="button" className="btn-secondary" onClick={() => {
                                  setEditingLinkId(null);
                                  setLinkTitle("");
                                  setLinkUrl("");
                                  setLinkInstructions("");
                                  setLinkVideo("");
                                  setLinkProductCode("");
                                }} style={{ height: "38px" }}>
                                  Cancelar
                                </button>
                              )}
                              
                              <button type="submit" className="btn-primary" style={{ height: "38px" }} disabled={addingLink}>
                                {addingLink ? "..." : (editingLinkId ? "💾 Salvar Alterações" : "➕ Add Acesso")}
                              </button>
                            </div>
                          </div>
                        </form>

                        <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>Acessos Ativos</h3>
                        {selectedProduct.deliveryLinks.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "10px", textAlign: "center" }}>Nenhum link de área de membros cadastrado para este produto.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {selectedProduct.deliveryLinks.map((l) => (
                              <div key={l.id} style={{ padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px", position: "relative" }}>
                                <div style={{ position: "absolute", top: "14px", right: "14px", display: "flex", gap: "12px" }}>
                                  <button 
                                    onClick={() => handleStartEditLink(l)} 
                                    style={{ background: "none", border: "none", color: "var(--color-brand-400)", cursor: "pointer", fontSize: "13px" }}
                                    title="Editar Acesso"
                                  >
                                    ✏️
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteLink(l.id)} 
                                    style={{ background: "none", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", fontSize: "12px" }}
                                    className="hover:text-red-500"
                                    title="Excluir Acesso"
                                  >
                                    🗑️
                                  </button>
                                </div>
                                
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                  <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--color-brand-400)" }}>{l.title}</div>
                                  {l.product_code && <span className="badge badge-purple" style={{ fontSize: "9px" }}>SKU: {l.product_code}</span>}
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginBottom: "4px" }}>
                                  🔗 <a href={l.login_url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{l.login_url}</a>
                                </div>
                                {l.instructions && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>📝 {l.instructions}</div>}
                                {l.video_url && <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>🎥 Vídeo: {l.video_url}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 6: FUNIS VINCULADOS */}
                {activeDetailTab === "automations" && (
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>🤖 Associar a Funis (Automações)</h3>
                    <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "-8px", marginBottom: "16px", lineHeight: "1.4" }}>
                      Selecione quais automações utilizarão as mídias, preços e métodos de entrega deste produto. Você pode selecionar mais de uma para ter estratégias diferentes para o mesmo produto!
                    </p>

                    {systemAutomations.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "10px", textAlign: "center" }}>Nenhum funil ou automação cadastrada no sistema.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                        {systemAutomations.map((a) => {
                          const isRelated = selectedProduct.automations.some(related => related.id === a.id);
                          return (
                            <div 
                              key={a.id}
                              style={{ 
                                padding: "12px 16px", 
                                background: "rgba(255,255,255,0.02)", 
                                border: isRelated ? "1px solid rgba(12,147,242,0.3)" : "1px solid rgba(255,255,255,0.05)",
                                borderRadius: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between"
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: "600", fontSize: "13px" }}>{a.name}</div>
                                <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>/{a.slug}</div>
                              </div>
                              <input 
                                type="checkbox" 
                                checked={isRelated} 
                                onChange={(e) => handleToggleAutomationRelation(a.id, e.target.checked)}
                                style={{ width: "16px", height: "16px", accentColor: "var(--color-brand-400)", cursor: "pointer" }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}


              </div>
            </div>
          )}
        </div>

      </div>

      {/* MODAL DE CRIAÇÃO DE PRODUTO */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeCreateModal} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px", padding: "28px", background: "var(--color-surface-700)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", width: "90%", maxHeight: "85vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "6px" }}>📦 Cadastrar Novo Produto</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "13px", marginBottom: "20px" }}>Crie a estrutura básica do produto para depois gerenciar mídias e ofertas.</p>
            
            <form onSubmit={handleCreateProduct}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome do Produto</label>
                <input className="input-field" placeholder="Ex: Kit Confeitaria Pro" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} required />
              </div>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Descrição do Produto</label>
                <textarea className="input-field" rows={2} placeholder="O que o produto engloba..." value={newProductDesc} onChange={(e) => setNewProductDesc(e.target.value)} style={{ resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px", padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "700", textTransform: "uppercase" }}>Métodos de Entrega Ativos</div>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>
                  <input type="checkbox" checked={newProductPdfs} onChange={(e) => setNewProductPdfs(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-brand-400)" }} />
                  📂 Entregar PDFs no WhatsApp
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>
                  <input type="checkbox" checked={newProductLinks} onChange={(e) => setNewProductLinks(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-brand-400)" }} />
                  🔑 Entregar Links de Áreas de Membros
                </label>
              </div>

              {systemAutomations.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Vincular a Funis Existentes (Opcional)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "110px", overflowY: "auto", padding: "4px" }}>
                    {systemAutomations.map(a => {
                      const selected = newProductAutos.includes(a.id);
                      return (
                        <span 
                          key={a.id}
                          onClick={() => toggleNewProductAuto(a.id)}
                          className={`badge ${selected ? "badge-info" : "badge-secondary"}`}
                          style={{ cursor: "pointer", opacity: selected ? 1 : 0.6, fontSize: "11px", padding: "5px 10px" }}
                        >
                          {selected ? "✅ " : ""}{a.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={closeCreateModal}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? "Criando..." : "📦 Criar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST DENTRO DA PAGINA */}
      {toast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "rgba(12,147,242,0.9)", color: "white", padding: "12px 24px", borderRadius: "10px", fontWeight: "600", fontSize: "13px", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", zIndex: 1000, transition: "all 0.3s ease" }}>
          {toast}
        </div>
      )}
    </AppLayout>
  );
}
