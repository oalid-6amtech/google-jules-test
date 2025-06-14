// components/ProductCard.js
import React from 'react';

const ProductCard = ({ product }) => {
  if (!product) {
    return null; // Or some placeholder for an empty card
  }

  const { name, imageUrl, price, url } = product;

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden transform transition-all hover:scale-105 duration-300 ease-in-out">
      <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={imageUrl || `https://via.placeholder.com/300x200.png?text=${encodeURIComponent(name || 'Product')}`}
          alt={name || 'Product Image'}
          className="w-full h-48 object-cover"
        />
      </a>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 h-12 overflow-hidden" title={name}>
          {name || 'Product Name Unavailable'}
        </h3>
        <p className="text-gray-700 font-bold mb-3">
          {price || 'Price not available'}
        </p>
        <a
          href={url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-yellow-500 text-gray-900 font-semibold px-4 py-2 rounded-md hover:bg-yellow-600 transition-colors text-sm w-full text-center"
        >
          View on Amazon
        </a>
      </div>
    </div>
  );
};

export default ProductCard;
