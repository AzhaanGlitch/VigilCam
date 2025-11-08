// VigilCam - Client-side JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Auto-hide alert messages after 5 seconds
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        alert.remove();
      }, 500);
    }, 5000);
  });

  // Add click-to-dismiss functionality for alerts
  alerts.forEach(alert => {
    alert.style.cursor = 'pointer';
    alert.addEventListener('click', function() {
      this.style.opacity = '0';
      this.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        this.remove();
      }, 300);
    });
  });

  // Monitoring page - simulate live stats (for demonstration)
  if (window.location.pathname === '/monitoring') {
    const statusDots = document.querySelectorAll('.status-dot');
    
    // Add blinking effect to active status dots
    statusDots.forEach(dot => {
      if (dot.classList.contains('active')) {
        setInterval(() => {
          dot.style.opacity = dot.style.opacity === '0.5' ? '1' : '0.5';
        }, 1000);
      }
    });
  }

  // Form validation enhancement
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const button = this.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.style.opacity = '0.6';
        button.innerHTML = '<span class="btn-icon">⟳</span> PROCESSING...';
        
        // Re-enable after 3 seconds in case of error
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
        }, 3000);
      }
    });
  });

  // Password visibility toggle (if needed in future)
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  passwordInputs.forEach(input => {
    input.addEventListener('focus', function() {
      this.style.borderColor = 'var(--accent-color)';
    });
    
    input.addEventListener('blur', function() {
      this.style.borderColor = 'var(--border-color)';
    });
  });

  // Console security message
  console.log('%cVigilCam Security System', 'color: #00ffff; font-size: 20px; font-weight: bold;');
  console.log('%cALWAYS ON WATCH. ZERO BLIND SPOTS.', 'color: #00ffff; font-size: 14px;');
  console.log('%cUnauthorized access is monitored and logged.', 'color: #ff3366; font-size: 12px;');
});