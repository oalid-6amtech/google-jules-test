// components/ProductList.js
import React from 'react';
import ProductCard from './ProductCard'; // We'll create this next

const ProductList = ({ products }) => {
  if (!products || products.length === 0) {
    return <p className="text-center text-gray-500">No products to display. Try searching for something!</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
};

export default ProductList;
