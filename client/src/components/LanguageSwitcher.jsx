import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from '../contexts/TranslationContext'

function LanguageSwitcher() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentLanguage, changeLanguage } = useTranslation()
  const dropdownRef = useRef(null)

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' }
  ]

  const handleLanguageChange = (langCode) => {
    changeLanguage(langCode)
    setDropdownOpen(false)
  }

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen)
  }

  // Language is now managed by the TranslationContext

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const currentLang = languages.find(lang => lang.code === currentLanguage) || languages[0]

  return (
    <div className="language-switcher" ref={dropdownRef}>
      <div className="language-dropdown">
        <button className="language-button" onClick={toggleDropdown}>
          <span className="globe-icon">🌍</span>
          <span className="current-flag">{currentLang.flag}</span>
          <span className="current-lang">{currentLang.name}</span>
          <span className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        
        <div className={`language-options ${dropdownOpen ? 'show' : ''}`}>
          {languages.map((language) => (
            <button
              key={language.code}
              className={`language-option ${currentLanguage === language.code ? 'active' : ''}`}
              onClick={() => handleLanguageChange(language.code)}
            >
              <span className="flag">{language.flag}</span>
              <span className="name">{language.name}</span>
              {currentLanguage === language.code && <span className="checkmark">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LanguageSwitcher
