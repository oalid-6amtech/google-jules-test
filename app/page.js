'use client';

import { useState } from 'react';
// We'll create this component in the next step
import ProductList from '@/components/ProductList';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setProducts([]); // Clear previous products

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'CAPTCHA_DETECTED') {
          setError('Amazon is asking for a CAPTCHA. Please try again later or try a different search term.');
        } else {
          setError(errorData.message || `Error: ${response.status} ${response.statusText}`);
        }
        setProducts([]); // Ensure products are cleared on error
        return;
      }

      const data = await response.json();
      if (data && data.length > 0) {
        setProducts(data);
      } else if (data && data.products && data.products.length === 0) { // Handling the case where API returns { products: [] } for no results
        setProducts([]);
        setError('No products found for your query. Try a different search term.');
      } else if (data && data.length === 0){
        setProducts([]);
        setError('No products found for your query. Try a different search term.');
      }
      else {
        // If API returns an unexpected structure but success status
        setProducts([]);
        console.warn('API returned success but no products or unexpected format:', data);
      }

    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch products. Please check your connection or try again.');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800">Amazon Product Search</h1>
        </header>

        <div className="mb-8 flex">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for products on Amazon..."
            className="flex-grow p-3 border border-gray-300 rounded-l-md focus:ring-indigo-500 focus:border-indigo-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="bg-indigo-600 text-white px-6 py-3 rounded-r-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 transition-colors"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {isLoading && <p className="text-center text-gray-600 text-lg">Loading products, please wait...</p>}

        {error && (
          <div className="text-center text-red-600 bg-red-100 p-4 rounded-md mb-6">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {!isLoading && !error && products.length === 0 && searchQuery && (
           <p className="text-center text-gray-500">
             No products found for "{searchQuery}". Try a different query or check for typos.
           </p>
        )}

        {!isLoading && products.length > 0 && (
          <ProductList products={products} />
        )}

        {!isLoading && !error && products.length === 0 && !searchQuery && (
          <p className="text-center text-gray-500">Enter a search term above to find products on Amazon.</p>
        )}
      </div>
    </div>
  );
}
