// src/hooks/useProducts.js
import { useState, useMemo, useCallback } from 'react';
import { db } from '../firebase'; 
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore'; // ✅ Importación corregida
import { useGlobalData } from '../context/GlobalDataContext'; 
import toast from 'react-hot-toast'; 

export const useProducts = (user) => {
  const { globalProducts, globalCategories, isGlobalLoading, businessBranches } = useGlobalData();
  
  const [isLoading, setIsLoading] = useState(false); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  
  const [branchStocks, setBranchStocks] = useState({}); 
  const [status, setStatus] = useState('activo');
  const [editing, setEditing] = useState(null);
  const [imageUrl, setImageUrl] = useState('');

  const filteredProducts = useMemo(() => {
    const safeProducts = globalProducts || []; 
    const lowerSearch = searchTerm.toLowerCase();
    
    return safeProducts.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(lowerSearch) || 
        p.category.toLowerCase().includes(lowerSearch);
        
      const isInactive = p.status === 'inactivo';
      
      if (!showInactive && isInactive) return false;
      return matchesSearch;
    });
  }, [globalProducts, searchTerm, showInactive]); 

  const openAddForm = useCallback(() => {
    setName('');
    setPrice('');
    setCategory('');
    setStatus('activo');
    setImageUrl(''); 
    
    const initialStocks = {};
    if (businessBranches) {
      businessBranches.forEach(b => { initialStocks[b.id] = ''; });
    }
    setBranchStocks(initialStocks);
    
    setEditing(null);
    setShowFormModal(true);
  }, [businessBranches]);

  const openEditForm = useCallback((p) => {
    setName(p.name);
    setPrice(p.price);
    setCategory(p.category);
    setStatus(p.status || 'activo');
    setImageUrl(p.imageUrl || ''); 

    setBranchStocks({}); 
    setEditing(p.id);
    setShowFormModal(true);
  }, []); 

  const handleSave = async (e) => {
    e.preventDefault();
    
    const cleanName = name.trim();
    if (!cleanName || !price || !category || !user?.businessId) {
      toast.error('Por favor, completa los campos obligatorios principales.');
      return;
    }

    const normalizedName = cleanName.toLowerCase();
    const safeProducts = globalProducts || []; 
    const isDuplicate = safeProducts.some(p => p.name.toLowerCase() === normalizedName && p.id !== editing);

    if (isDuplicate) {
      toast.error(`El producto "${cleanName}" ya está registrado.`);
      return;
    }

    setIsLoading(true);
    const toastId = 'product-toast';
    toast.loading(editing ? 'Actualizando producto...' : 'Agregando producto...', { id: toastId });

    try {
      const currentProduct = editing ? globalProducts.find(p => p.id === editing) : null;
      
      // 🚀 RECUPERACIÓN SEGURA DE STOCK VIEJO
      let stockViejo = {};
      if (currentProduct) {
        if (typeof currentProduct.stock === 'object' && currentProduct.stock !== null) {
          stockViejo = currentProduct.stock; 
        } else if (typeof currentProduct.rawStock === 'object' && currentProduct.rawStock !== null) {
          stockViejo = currentProduct.rawStock; 
        } else if (typeof currentProduct.stock === 'number' || typeof currentProduct.rawStock === 'number') {
          const oldNum = Number(currentProduct.stock || currentProduct.rawStock || 0);
          const defaultBranch = businessBranches.length > 0 ? businessBranches[0].id : 'global';
          stockViejo = { [defaultBranch]: oldNum };
        }
      }

      let finalStockObject = { ...stockViejo };
      let newLastStockHistory = currentProduct?.lastStockHistory ? { ...currentProduct.lastStockHistory } : {};

      // 🚀 CÁLCULO MATEMÁTICO BLINDADO
      businessBranches.forEach(branch => {
        const bId = branch.id;
        const actual = Number(finalStockObject[bId]) || 0; 
        const inputValue = branchStocks[bId];              

        if (inputValue !== undefined && inputValue !== null && inputValue !== '') {
           const ajuste = Number(inputValue);
           
           if (!isNaN(ajuste)) {
              const ajusteEntero = Math.floor(ajuste); // Evitamos decimales en el stock
              
              if (editing) {
                const stockFinal = Math.max(0, actual + ajusteEntero);
                finalStockObject[bId] = stockFinal;
                
                if (ajusteEntero !== 0) {
                  const mathSign = ajusteEntero > 0 ? '+' : '-';
                  newLastStockHistory[bId] = `${actual} ${mathSign} ${Math.abs(ajusteEntero)} = ${stockFinal}`;
                }
              } else {
                finalStockObject[bId] = Math.max(0, ajusteEntero);
              }
           }
        }
      });

      const productData = {
        name: cleanName,
        price: Math.max(0, parseFloat(price) || 0),
        category,
        stock: finalStockObject, 
        status,
        businessId: user.businessId,
        imageUrl: imageUrl || '',
        lastStockHistory: newLastStockHistory,
        updatedAt: Timestamp.now()
      };

      if (editing) {
        await updateDoc(doc(db, 'products', editing), productData);
        toast.success('Producto actualizado con éxito', { id: toastId });
      } else {
        productData.createdAt = Timestamp.now();
        await addDoc(collection(db, 'products'), productData);
        toast.success('¡Producto agregado al catálogo!', { id: toastId });
      }
      
      setShowFormModal(false);
    } catch (error) {
      console.error("Error al guardar producto:", error); 
      toast.error('Error al guardar el producto.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    categories: globalCategories, 
    businessBranches, 
    isLoading, 
    isFetching: isGlobalLoading, 
    searchTerm, setSearchTerm,
    showFormModal, setShowFormModal, showInactive, setShowInactive,
    name, setName, price, setPrice, category, setCategory, 
    branchStocks, setBranchStocks, 
    status, setStatus, editing,
    imageUrl, setImageUrl, 
    filteredProducts, openAddForm, openEditForm, handleSave
  };
};