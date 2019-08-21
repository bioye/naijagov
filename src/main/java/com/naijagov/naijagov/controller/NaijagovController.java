package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Constituency;
import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.model.LocalGov;
import com.naijagov.naijagov.model.PollingUnit;
import com.naijagov.naijagov.model.Ward;
import com.naijagov.naijagov.service.LocalGovService;
import com.naijagov.naijagov.service.PollingUnitService;
import com.naijagov.naijagov.service.WardService;

import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttributes;
import org.springframework.web.servlet.ModelAndView;

@Controller
@SessionAttributes({ "form" })
public class NaijagovController {

  private PollingUnitService pollingUnitService;
  private WardService wardService;
  private LocalGovService localGovService;

  @ModelAttribute
  public Form form() {
    return new Form();
  }

  @Autowired
  public NaijagovController(PollingUnitService pollingUnitService, WardService wardService,
      LocalGovService localGovService) {
    this.pollingUnitService = pollingUnitService;
    this.wardService = wardService;
    this.localGovService = localGovService;
  }

  @GetMapping("/localgovs")
  public ModelAndView localGovs(
      @PageableDefault(size = 10, sort = "code", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getLocalGovsPage(), pageable, sortBy, sortDirection);
    form.setLocalGovsPage(localGovService.listAllLocalGovs(sortedPage));
    mv.setViewName("localgovs");
    return mv;
  }

  @GetMapping("/wards")
  public ModelAndView wards(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getWardsPage(), pageable, sortBy, sortDirection);
    form.setWardsPage(wardService.listAllWards(sortedPage));
    mv.setViewName("wards");
    return mv;
  }

  @GetMapping("/pollingunits")
  public ModelAndView pollingUnits(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getPollingUnitsPage(), pageable, sortBy, sortDirection);
    form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(sortedPage));
    mv.setViewName("pollingunits");
    return mv;
  }

  @GetMapping("/localgov/{id}")
  public ModelAndView displayLocalGov(@PathVariable Integer id,
      @PageableDefault(size = 10, sort = "code", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Optional<LocalGov> optionalLocalGov = localGovService.findLocalGov(id);
    ModelAndView modelAndView = new ModelAndView();
    LocalGov localGovObject = null;
    if (optionalLocalGov.isPresent()) {
      localGovObject = optionalLocalGov.get();
      modelAndView.addObject(localGovObject);
    }
    Pageable sortedPage = getSortedPage(form.getLocalGovPage(), pageable, sortBy, sortDirection);
    form.setLocalGovPage(wardService.getWards(sortedPage, localGovObject));
    modelAndView.setViewName("localgov");
    return modelAndView;
  }

  @GetMapping("/ward/{id}")
  public ModelAndView displayWard(@PathVariable Integer id,
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Ward wardObject = getConstituency(wardService.findWard(id));
    ModelAndView modelAndView = getConstituencyModelAndView(wardObject, "ward");
    Pageable sortedPage = getSortedPage(form.getWardPage(), pageable, sortBy, sortDirection);
    form.setWardPage(pollingUnitService.getPollingUnits(sortedPage, wardObject));
    return modelAndView;
  }

  @GetMapping("/pollingunit/{id}")
  public ModelAndView displayPollingUnit(@PathVariable Integer id) {
    return getConstituencyModelAndView(pollingUnitService.findPollingUnit(id), "pollingunit");
  }

  public ModelAndView getConstituencyModelAndView(Optional<? extends Constituency> optional, String constituencyName) {
    return getConstituencyModelAndView(getConstituency(optional), constituencyName);
  }

  public ModelAndView getConstituencyModelAndView(Constituency constituency, String constituencyName) {
    ModelAndView modelAndView = getConstituencyModelAndView(constituency);
    modelAndView.setViewName(constituencyName);
    return modelAndView;
  }

  public ModelAndView getConstituencyModelAndView(Constituency constituency) {
    ModelAndView modelAndView = new ModelAndView();
    modelAndView.addObject(constituency);
    return modelAndView;
  }

  public ModelAndView getConstituencyModelAndView(Optional<? extends Constituency> optional) {
    ModelAndView modelAndView = new ModelAndView();
    modelAndView.addObject(getConstituency(optional));
    return modelAndView;
  }

  public <T extends Constituency> T getConstituency(Optional<T> optional){
    if (optional.isPresent()) {
      return optional.get();
    }
    return null;
  }

  public Pageable getSortedPage(Page<?> page, Pageable pageable, Optional<String> sortBy,
      Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = pageable;
    // initial page load, no params
    if (page == null) {
      sortedPage = pageable;
    }
    // when header sort is clicked
    else if (sortBy.isPresent() && sortDirection.isPresent()) {
      sortedPage = PageRequest.of(page.getNumber(), page.getSize(), sortDirection.get(), sortBy.get());
    }
    // when navigation link is clicked
    else if (page != null) {
      sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), page.getSort());
    }
    return sortedPage;
  }
}
